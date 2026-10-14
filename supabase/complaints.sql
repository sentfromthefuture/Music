-- Buyer complaints on a purchased beat ("Report a problem" under the purchase in Account).
-- Visible to: the buyer (their own), the producer of that beat, and admins (Admin -> Complaints).
-- Adds ONE table + two small helper functions. Safe to run more than once.
-- Until it is run, the "Report a problem" button stays hidden and the Admin tab says it is not set up.

create or replace function public.zami_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;
grant execute on function public.zami_is_admin() to authenticated;

create table if not exists public.purchase_complaints (
  id bigint generated always as identity primary key,
  purchase_id text not null,
  item_id text not null,
  item_type text not null default 'beat',
  buyer_id uuid not null default auth.uid(),
  producer_id uuid not null,
  buyer_name text,
  buyer_contact text,
  message text not null check (char_length(btrim(message)) between 5 and 1000),
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now()
);
create index if not exists purchase_complaints_producer_idx on public.purchase_complaints (producer_id);
create index if not exists purchase_complaints_purchase_idx on public.purchase_complaints (purchase_id);

-- how many complaints this buyer filed in the last 24h (used to stop spam; SECURITY DEFINER avoids policy recursion)
create or replace function public.zami_complaints_today() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.purchase_complaints where buyer_id = auth.uid() and created_at > now() - interval '1 day'
$$;
grant execute on function public.zami_complaints_today() to authenticated;

alter table public.purchase_complaints enable row level security;

drop policy if exists "complaints buyer insert" on public.purchase_complaints;
create policy "complaints buyer insert" on public.purchase_complaints for insert
  with check (buyer_id = auth.uid()
    and status = 'open'
    and public.zami_complaints_today() < 10
    and exists (select 1 from public.purchases p where p.id::text = purchase_complaints.purchase_id and p.buyer_id = auth.uid()
      and p.status = 'fulfilled' and p.item_id::text = purchase_complaints.item_id and p.item_type = 'beat')
    and exists (select 1 from public.beats b where b.id::text = purchase_complaints.item_id and b.owner_id = purchase_complaints.producer_id));

drop policy if exists "complaints buyer read" on public.purchase_complaints;
create policy "complaints buyer read" on public.purchase_complaints for select using (buyer_id = auth.uid());
drop policy if exists "complaints producer read" on public.purchase_complaints;
create policy "complaints producer read" on public.purchase_complaints for select using (producer_id = auth.uid());
drop policy if exists "complaints admin read" on public.purchase_complaints;
create policy "complaints admin read" on public.purchase_complaints for select using (public.zami_is_admin());
-- only admins can change a complaint (mark resolved); buyers and producers cannot edit or delete
drop policy if exists "complaints admin update" on public.purchase_complaints;
create policy "complaints admin update" on public.purchase_complaints for update using (public.zami_is_admin()) with check (public.zami_is_admin());

grant select, insert, update on public.purchase_complaints to authenticated;

-- Producer replies / Mark as fixed / buyer Reopen (guard trigger)
alter table public.purchase_complaints add column if not exists producer_reply text;
alter table public.purchase_complaints add column if not exists producer_fixed_at timestamptz;
alter table public.purchase_complaints add column if not exists reopened_at timestamptz;

create or replace function public.zami_complaints_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;          -- SQL editor / server: trusted
  if current_setting('zami.reopen', true) = '1' then return new; end if;  -- set only inside reopen_complaint()
  if (new.message, new.purchase_id, new.item_id, new.item_type, new.buyer_id, new.producer_id, new.buyer_name, new.buyer_contact, new.created_at)
     is distinct from
     (old.message, old.purchase_id, old.item_id, old.item_type, old.buyer_id, old.producer_id, old.buyer_name, old.buyer_contact, old.created_at) then
    raise exception 'The original report cannot be edited';
  end if;
  if public.zami_is_admin() then return new; end if;      -- admins: status / reply fields
  if auth.uid() = old.producer_id then
    if new.status is distinct from old.status or new.reopened_at is distinct from old.reopened_at then
      raise exception 'Only ZAMI management can resolve a complaint';
    end if;
    if old.status = 'resolved' then raise exception 'This complaint is already resolved'; end if;
    if new.producer_fixed_at is distinct from old.producer_fixed_at then
      if old.producer_fixed_at is not null or new.producer_fixed_at is null then
        raise exception 'Already marked as fixed';
      end if;
      if char_length(btrim(coalesce(new.producer_reply, ''))) < 5 then
        raise exception 'Please write a short reply for the buyer';
      end if;
      new.producer_fixed_at := now();                     -- server clock, cannot be spoofed
    end if;
    return new;
  elsif auth.uid() = old.buyer_id then
    if not (new.status = 'open' and (old.status = 'resolved' or old.producer_fixed_at is not null)) then
      raise exception 'Buyers can only reopen a complaint that was marked fixed or resolved';
    end if;
    if new.producer_reply is distinct from old.producer_reply then raise exception 'Not allowed'; end if;
    new.producer_fixed_at := null;
    new.reopened_at := now();
    return new;
  end if;
  raise exception 'Not allowed';
end $$;

-- Buyer "Reopen": a dedicated function so it behaves the same for every account (even an admin or
-- producer who is also the buyer). Only the buyer of that complaint can call it successfully.
create or replace function public.reopen_complaint(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r public.purchase_complaints;
begin
  select * into r from public.purchase_complaints where id = p_id;
  if not found or r.buyer_id is distinct from auth.uid() then raise exception 'Complaint not found'; end if;
  if not (r.status = 'resolved' or r.producer_fixed_at is not null) then raise exception 'Nothing to reopen'; end if;
  perform set_config('zami.reopen', '1', true);
  update public.purchase_complaints set status = 'open', producer_fixed_at = null, reopened_at = now() where id = p_id;
  perform set_config('zami.reopen', '', true);
end $$;
grant execute on function public.reopen_complaint(bigint) to authenticated;

drop trigger if exists zami_complaints_guard on public.purchase_complaints;
create trigger zami_complaints_guard before update on public.purchase_complaints
  for each row execute function public.zami_complaints_guard();

drop policy if exists "complaints admin update" on public.purchase_complaints;
drop policy if exists "complaints update" on public.purchase_complaints;
create policy "complaints update" on public.purchase_complaints for update
  using (public.zami_is_admin() or producer_id = auth.uid() or buyer_id = auth.uid())
  with check (public.zami_is_admin() or producer_id = auth.uid() or buyer_id = auth.uid());

notify pgrst, 'reload schema';
