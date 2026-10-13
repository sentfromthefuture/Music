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
    and exists (select 1 from public.purchases p where p.id::text = purchase_id and p.buyer_id = auth.uid()
      and p.status = 'fulfilled' and p.item_id::text = item_id and p.item_type = 'beat')
    and exists (select 1 from public.beats b where b.id::text = item_id and b.owner_id = producer_id));

drop policy if exists "complaints buyer read" on public.purchase_complaints;
create policy "complaints buyer read" on public.purchase_complaints for select using (buyer_id = auth.uid());
drop policy if exists "complaints producer read" on public.purchase_complaints;
create policy "complaints producer read" on public.purchase_complaints for select using (producer_id = auth.uid());
drop policy if exists "complaints admin read" on public.purchase_complaints;
create policy "complaints admin read" on public.purchase_complaints for select using (public.zami_is_admin());
-- only admins can change a complaint (mark resolved); buyers and producers cannot edit or delete
drop policy if exists "complaints admin update" on public.purchase_complaints;
create policy "complaints admin update" on public.purchase_complaints for update using (public.zami_is_admin()) with check (public.zami_is_admin());
