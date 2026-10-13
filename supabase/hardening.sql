-- ZAMI hardening. Run AFTER supabase/beat-licensing.sql. Safe to run again.
-- Every guard only applies to requests coming from the website (roles anon / authenticated).
-- It does NOT apply to the Supabase SQL editor, the service role, or SECURITY DEFINER functions
-- (increment_purchase_count and friends), so admin work and your counters keep working.

-- 1) A new purchase always starts as 'requested'. Nobody can insert one that is already "paid".
create or replace function public.zami_purchase_insert_lock() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.status := 'requested';
    new.fulfilled_at := null;
    new.download_url := null;
  end if;
  return new;
end $$;
drop trigger if exists zami_purchase_insert_lock on public.purchases;
create trigger zami_purchase_insert_lock before insert on public.purchases
  for each row execute function public.zami_purchase_insert_lock();

-- 2) Owners can only do what the site lets them do to their own track/beat:
--    submit payment proof (pending_payment -> pending_review). Only admins change status otherwise,
--    and nobody can edit counters, owner or reference from the browser.
create or replace function public.zami_owner_update_guard() returns trigger
language plpgsql as $$
declare v_admin boolean; v_new jsonb; v_old jsonb; k text;
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  select coalesce(p.is_admin, false) into v_admin from public.profiles p where p.id = auth.uid();
  if coalesce(v_admin, false) then return new; end if;
  if new.status is distinct from old.status
     and not (old.status = 'pending_payment' and new.status = 'pending_review') then
    raise exception 'You cannot change the status of this item';
  end if;
  v_new := to_jsonb(new); v_old := to_jsonb(old);
  foreach k in array array['owner_id','play_count','download_count','purchase_count','removed_at','reference_number','created_at'] loop
    if v_old ? k then v_new := jsonb_set(v_new, array[k], v_old -> k); end if;
  end loop;
  return jsonb_populate_record(new, v_new);
end $$;
drop trigger if exists zami_owner_update_guard on public.tracks;
create trigger zami_owner_update_guard before update on public.tracks
  for each row execute function public.zami_owner_update_guard();
drop trigger if exists zami_owner_update_guard on public.beats;
create trigger zami_owner_update_guard before update on public.beats
  for each row execute function public.zami_owner_update_guard();

-- 3) Nobody can make themselves an admin from the browser (on signup or later).
create or replace function public.zami_profile_admin_guard() returns trigger
language plpgsql as $$
declare v_admin boolean;
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then new.is_admin := false; return new; end if;
  select coalesce(p.is_admin, false) into v_admin from public.profiles p where p.id = auth.uid();
  if not coalesce(v_admin, false) then new.is_admin := old.is_admin; end if;
  return new;
end $$;
drop trigger if exists zami_profile_admin_guard on public.profiles;
create trigger zami_profile_admin_guard before insert or update on public.profiles
  for each row execute function public.zami_profile_admin_guard();

-- 4) Buyers cannot UPDATE purchases (good: they can't touch price or status), so the "I've paid, here is
--    my SMS" step needs its own narrow door: it can only set the SMS text of YOUR OWN still-pending purchase.
create or replace function public.submit_purchase_sms(p_purchase_id text, p_sms text) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.purchases set transaction_sms = left(p_sms, 2000)
   where id::text = p_purchase_id and status = 'requested' and (buyer_id is null or buyer_id = auth.uid());
  get diagnostics n = row_count;
  return n = 1;
end $$;
grant execute on function public.submit_purchase_sms(text, text) to anon, authenticated;
