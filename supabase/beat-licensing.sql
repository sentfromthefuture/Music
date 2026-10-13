-- ZAMI beat licensing (tiers, exclusive rule, price integrity, stems requests, license verify).
-- Run ONCE in Supabase -> SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Until you run it, the site keeps working exactly as before (the new UI switches itself on
-- only when it detects the new columns).

-- 1) New columns -------------------------------------------------------------------------------
alter table public.beats add column if not exists license_tiers jsonb;      -- {"basic":{"price":50},"premium":{"price":120,"extras":true},"exclusive":{...}}
alter table public.beats add column if not exists exclusive_sold boolean not null default false;
alter table public.beats add column if not exists music_key text;
alter table public.beats add column if not exists tags text[];
alter table public.beats add column if not exists rights_confirmed boolean not null default false;

alter table public.purchases add column if not exists license_tier text check (license_tier in ('basic','premium','exclusive'));
alter table public.purchases add column if not exists license_id text;
alter table public.purchases add column if not exists buyer_name text;
create unique index if not exists purchases_license_id_key on public.purchases (license_id) where license_id is not null;

-- 2) Purchase guard: the SERVER decides the price, the license id, and whether it can be bought --
create or replace function public.zami_purchase_guard() returns trigger
language plpgsql as $$
declare v_price numeric; v_status text; v_sold boolean; v_tiers jsonb;
begin
  if new.item_type = 'beat' then
    select b.status, b.exclusive_sold, b.license_tiers, b.price
      into v_status, v_sold, v_tiers, v_price
      from public.beats b where b.id::text = new.item_id::text;
    if not found or v_status is distinct from 'approved' then raise exception 'This beat is not available'; end if;
    if coalesce(v_sold, false) then raise exception 'This beat was sold exclusively'; end if;
    if v_tiers is not null then
      if new.license_tier is null or (v_tiers -> new.license_tier) is null then
        raise exception 'Choose a license tier for this beat';
      end if;
      v_price := (v_tiers -> new.license_tier ->> 'price')::numeric;
    else
      new.license_tier := null;
    end if;
  elsif new.item_type = 'track' then
    select t.price into v_price from public.tracks t where t.id::text = new.item_id::text;
    new.license_tier := null;
  end if;
  if v_price is not null and v_price > 0 then new.amount := v_price; end if;
  if new.license_tier is not null then
    new.license_id := 'ZL-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  else
    new.license_id := null;
  end if;
  return new;
end $$;
drop trigger if exists zami_purchase_guard on public.purchases;
create trigger zami_purchase_guard before insert on public.purchases
  for each row execute function public.zami_purchase_guard();

-- 3) Exclusive rule: approving an EXCLUSIVE purchase delists the beat, and it cannot be relisted --
create or replace function public.zami_exclusive_on_fulfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.item_type = 'beat' and new.license_tier = 'exclusive' and new.status = 'fulfilled'
     and old.status is distinct from 'fulfilled' then
    update public.beats set exclusive_sold = true, status = 'removed' where id::text = new.item_id::text;
  end if;
  return new;
end $$;
drop trigger if exists zami_exclusive_on_fulfil on public.purchases;
create trigger zami_exclusive_on_fulfil after update on public.purchases
  for each row execute function public.zami_exclusive_on_fulfil();

create or replace function public.zami_beat_exclusive_guard() returns trigger
language plpgsql as $$
begin
  -- Only an admin working in the SQL editor can undo an exclusive sale:
  --   begin; set local zami.allow_reset = 'on'; update beats set exclusive_sold=false, status='approved' where id=...; commit;
  if old.exclusive_sold and not new.exclusive_sold and coalesce(current_setting('zami.allow_reset', true), '') <> 'on' then
    new.exclusive_sold := true;
  end if;
  if new.exclusive_sold and new.status = 'approved' then new.status := 'removed'; end if;
  return new;
end $$;
drop trigger if exists zami_beat_exclusive_guard on public.beats;
create trigger zami_beat_exclusive_guard before update on public.beats
  for each row execute function public.zami_beat_exclusive_guard();

-- 3b) Buyers can still read a beat they paid for, even after it is delisted (exclusive sale or takedown).
-- Uses a SECURITY DEFINER helper so the policy never re-enters purchases' own policies
-- (a direct sub-select caused "infinite recursion detected in policy for relation beats").
drop policy if exists "beats buyer read" on public.beats;
create or replace function public.zami_bought_beat(p_beat_id text, p_premium_only boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.purchases p
    where p.item_type = 'beat' and p.item_id::text = p_beat_id and p.buyer_id = auth.uid()
      and p.status = 'fulfilled'
      and (not p_premium_only or p.license_tier in ('premium','exclusive')))
$$;
grant execute on function public.zami_bought_beat(text, boolean) to anon, authenticated;
create policy "beats buyer read" on public.beats for select using (public.zami_bought_beat(id::text));

-- 4) Stems / WAV link: private to the producer and to buyers of Premium or Exclusive ------------
create table if not exists public.beat_extras (
  beat_id text primary key,
  owner_id uuid not null default auth.uid(),
  link text not null,
  note text,
  updated_at timestamptz not null default now()
);
alter table public.beat_extras enable row level security;
drop policy if exists "extras owner" on public.beat_extras;
create policy "extras owner" on public.beat_extras for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.beats b where b.id::text = beat_id and b.owner_id = auth.uid()));
drop policy if exists "extras buyer read" on public.beat_extras;
create policy "extras buyer read" on public.beat_extras for select
  using (public.zami_bought_beat(beat_id, true));

-- 5) "Request stems / WAV" (producer delivers off-platform) ---------------------------------------
create table if not exists public.stem_requests (
  id bigint generated always as identity primary key,
  purchase_id text not null unique,
  beat_id text not null,
  buyer_id uuid not null default auth.uid(),
  producer_id uuid not null,
  buyer_name text,
  buyer_contact text,
  message text,
  status text not null default 'requested' check (status in ('requested','delivered')),
  created_at timestamptz not null default now()
);
alter table public.stem_requests enable row level security;
drop policy if exists "stems buyer insert" on public.stem_requests;
create policy "stems buyer insert" on public.stem_requests for insert
  with check (buyer_id = auth.uid()
    and exists (select 1 from public.purchases p where p.id::text = purchase_id and p.buyer_id = auth.uid()
      and p.status = 'fulfilled' and p.license_tier in ('premium','exclusive') and p.item_id::text = beat_id)
    and exists (select 1 from public.beats b where b.id::text = beat_id and b.owner_id = producer_id));
drop policy if exists "stems buyer read" on public.stem_requests;
create policy "stems buyer read" on public.stem_requests for select using (buyer_id = auth.uid());
drop policy if exists "stems producer read" on public.stem_requests;
create policy "stems producer read" on public.stem_requests for select using (producer_id = auth.uid());
drop policy if exists "stems producer update" on public.stem_requests;
create policy "stems producer update" on public.stem_requests for update using (producer_id = auth.uid()) with check (producer_id = auth.uid());

-- 6) Public license check (drop first: the return type changed if you ran an earlier draft) (used by license.html?id=ZL-XXXXXXXX). Returns only what is on the license.
drop function if exists public.verify_license(text);
create or replace function public.verify_license(p_license_id text)
returns table (license_id text, tier text, buyer_name text, beat_title text, producer_name text, issued_at timestamptz, extras boolean)
language sql stable security definer set search_path = public as $$
  select p.license_id, p.license_tier, p.buyer_name, b.title, pr.display_name, p.fulfilled_at,
         coalesce((b.license_tiers -> p.license_tier ->> 'extras')::boolean, false)
  from public.purchases p
  join public.beats b on b.id::text = p.item_id::text and p.item_type = 'beat'
  left join public.profiles pr on pr.id = b.owner_id
  where p.license_id = upper(trim(p_license_id)) and p.status = 'fulfilled'
$$;
grant execute on function public.verify_license(text) to anon, authenticated;
