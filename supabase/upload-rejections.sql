-- ZAMI: remember rejected uploads (Admin -> Purchased Items -> Rejected uploads).
-- Run ONCE in Supabase -> SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Until now, rejecting an upload in Admin -> Pending Review just sent it back to the artist as "Awaiting payment"
-- and cleared its payment SMS, so nothing recorded that it had been rejected. From the moment you run this, every
-- rejection is logged here (what, who uploaded it, the SMS they sent, when). Rejections from before cannot be recovered.
-- Only admins can read or write this log. Until you run it, rejecting works exactly as before.
create table if not exists public.upload_rejections (
  id bigint generated always as identity primary key,
  item_type text not null check (item_type in ('track', 'beat')),
  item_id text not null,
  owner_id uuid,
  title text,
  genre text,
  reference_number text,
  transaction_sms text,
  rejected_by uuid default auth.uid(),
  rejected_at timestamptz not null default now()
);
create index if not exists upload_rejections_rejected_at_idx on public.upload_rejections (rejected_at desc);
alter table public.upload_rejections enable row level security;
drop policy if exists "admins read rejections" on public.upload_rejections;
create policy "admins read rejections" on public.upload_rejections for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));
drop policy if exists "admins log rejections" on public.upload_rejections;
create policy "admins log rejections" on public.upload_rejections for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));
grant select, insert on public.upload_rejections to authenticated;
notify pgrst, 'reload schema';
