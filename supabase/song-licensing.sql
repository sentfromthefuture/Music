-- ZAMI song licensing: OPTIONAL licenses an artist can offer on a song, next to the normal Free/Paid download.
-- Run ONCE in Supabase -> SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Run it AFTER supabase/beat-licensing.sql and supabase/hardening.sql.
--
-- This file is independent of beat licensing: it adds NEW columns and NEW functions/triggers only.
-- It does not change any beat column, constraint, trigger or function, so beat licensing behaves exactly
-- as before, and re-running beat-licensing.sql later cannot undo anything here.
-- Until you run it, the site keeps working exactly as before (the song-license UI switches itself on
-- only when it detects the new columns).

-- 1) New columns -------------------------------------------------------------------------------
-- tracks.license_tiers = {"creator":{"price":50,"months":12,"territory":"zm"}, "business":{...}, ...}
--   months: 12 / 36 / 60, or 0 for lifetime.  territory: zm | africa | world.
alter table public.tracks add column if not exists license_tiers jsonb;
alter table public.tracks add column if not exists license_rights_confirmed boolean not null default false;
alter table public.tracks add column if not exists license_agreed_at timestamptz;   -- when the artist authorised ZAMI to issue these licenses

-- A song license is a purchase with song_license_tier set. license_tier (beats) is left alone.
alter table public.purchases add column if not exists song_license_tier text;
alter table public.purchases add column if not exists license_terms jsonb;          -- frozen copy of the terms at the moment of purchase
alter table public.purchases drop constraint if exists purchases_song_license_tier_check;
alter table public.purchases add constraint purchases_song_license_tier_check
  check (song_license_tier is null or song_license_tier in ('creator','business','film','broadcast','live'));

-- 2) Artist's license options must be valid, and need the rights confirmation ----------------------
create or replace function public.zami_song_tiers_guard() returns trigger
language plpgsql as $$
declare k text; v jsonb; p numeric; m int; t text;
begin
  if tg_op = 'UPDATE'
     and new.license_tiers is not distinct from old.license_tiers
     and new.license_rights_confirmed is not distinct from old.license_rights_confirmed then
    return new;                                   -- unrelated edit (status, counters ...): leave alone
  end if;
  if new.license_tiers is null or new.license_tiers = '{}'::jsonb then
    new.license_tiers := null; new.license_agreed_at := null;
    return new;
  end if;
  if jsonb_typeof(new.license_tiers) <> 'object' then raise exception 'Invalid license options'; end if;
  if not coalesce(new.license_rights_confirmed, false) then
    raise exception 'Please confirm you control the rights you are licensing';
  end if;
  for k, v in select key, value from jsonb_each(new.license_tiers) loop
    if k not in ('creator','business','film','broadcast','live') then raise exception 'Unknown license type: %', k; end if;
    begin
      p := (v ->> 'price')::numeric; m := (v ->> 'months')::int;
    exception when others then raise exception 'Invalid license options';
    end;
    t := v ->> 'territory';
    if p is null or p < 1 or p > 100000 then raise exception 'Set a price between K1 and K100000 for the % license', k; end if;
    if m is null or m not in (0, 12, 36, 60) then raise exception 'Choose a valid duration for the % license', k; end if;
    if t is null or t not in ('zm', 'africa', 'world') then raise exception 'Choose a territory for the % license', k; end if;
  end loop;
  -- keep only the known fields
  new.license_tiers := (select jsonb_object_agg(key, jsonb_build_object(
      'price', (value ->> 'price')::numeric, 'months', (value ->> 'months')::int, 'territory', value ->> 'territory'))
    from jsonb_each(new.license_tiers));
  new.license_agreed_at := now();                 -- the artist (re-)authorised these exact options just now
  return new;
end $$;
drop trigger if exists zami_song_tiers_guard on public.tracks;
create trigger zami_song_tiers_guard before insert or update on public.tracks
  for each row execute function public.zami_song_tiers_guard();

-- 3) Purchase guard for song licenses: the SERVER decides the price, the license id and the frozen terms.
-- Trigger names run alphabetically: zami_purchase_guard, zami_purchase_insert_lock, then this one (last),
-- so it can safely finish what they started for track purchases.
create or replace function public.zami_song_license_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status text; v_tiers jsonb; v_title text; v_owner uuid; v_agreed timestamptz; v_tier jsonb; v_artist text;
begin
  if new.item_type is distinct from 'track' or new.song_license_tier is null then
    new.song_license_tier := null; new.license_terms := null;     -- not a song license: nothing to add
    return new;
  end if;
  select t.status, t.license_tiers, t.title, t.owner_id, t.license_agreed_at
    into v_status, v_tiers, v_title, v_owner, v_agreed
    from public.tracks t where t.id::text = new.item_id::text;
  if not found or v_status is distinct from 'approved' then raise exception 'This song is not available'; end if;
  v_tier := v_tiers -> new.song_license_tier;
  if v_tier is null then raise exception 'This license is not offered for this song'; end if;
  select pr.display_name into v_artist from public.profiles pr where pr.id = v_owner;
  new.amount := (v_tier ->> 'price')::numeric;
  new.license_tier := null;                                         -- beat tiers never apply to songs
  new.license_id := 'SL-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  new.license_terms := jsonb_build_object(
    'v', 1, 'type', new.song_license_tier,
    'price', (v_tier ->> 'price')::numeric, 'months', (v_tier ->> 'months')::int, 'territory', v_tier ->> 'territory',
    'title', v_title, 'artist', v_artist, 'authorised_at', v_agreed);
  return new;
end $$;
drop trigger if exists zami_song_license_guard on public.purchases;
create trigger zami_song_license_guard before insert on public.purchases
  for each row execute function public.zami_song_license_guard();

-- 4) Public license check (used by license.html?id=SL-XXXXXXXX). Returns only what is on the license.
-- Reads the FROZEN terms, so it keeps working even if the artist later edits or deletes the song.
drop function if exists public.verify_song_license(text);
create or replace function public.verify_song_license(p_license_id text)
returns table (license_id text, license_type text, buyer_name text, song_title text, artist_name text,
               issued_at timestamptz, months int, territory text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.license_id, p.song_license_tier, p.buyer_name,
         p.license_terms ->> 'title', p.license_terms ->> 'artist', p.fulfilled_at,
         (p.license_terms ->> 'months')::int, p.license_terms ->> 'territory',
         case when coalesce((p.license_terms ->> 'months')::int, 0) > 0
              then p.fulfilled_at + make_interval(months => (p.license_terms ->> 'months')::int) end
  from public.purchases p
  where p.license_id = upper(trim(p_license_id)) and p.status = 'fulfilled' and p.song_license_tier is not null
$$;
grant execute on function public.verify_song_license(text) to anon, authenticated;

notify pgrst, 'reload schema';
