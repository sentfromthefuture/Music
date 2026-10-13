create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
create table public.profiles (id uuid primary key, display_name text, is_admin boolean not null default false, role text default 'listener', momo_number text);
create table public.tracks (id bigint generated always as identity primary key, owner_id uuid, title text, price numeric default 0, status text default 'pending_payment', play_count int default 0, download_count int default 0, purchase_count int default 0, removed_at timestamptz, reference_number text, created_at timestamptz default now(), transaction_sms text);
create table public.beats (id bigint generated always as identity primary key, owner_id uuid, title text, price numeric default 0, bpm int, status text default 'pending_payment', play_count int default 0, download_count int default 0, purchase_count int default 0, removed_at timestamptz, reference_number text, created_at timestamptz default now(), transaction_sms text, full_path text);
create table public.purchases (id bigint generated always as identity primary key, buyer_id uuid, buyer_contact text, item_id bigint, item_type text, amount numeric, status text not null default 'requested', reference_number text unique, transaction_sms text, fulfilled_at timestamptz, download_url text, created_at timestamptz default now());
alter table public.profiles enable row level security; alter table public.tracks enable row level security; alter table public.beats enable row level security; alter table public.purchases enable row level security;
create policy "profiles read" on public.profiles for select using (true);
create policy "profiles self update" on public.profiles for update using (id = auth.uid());
create policy "profiles self insert" on public.profiles for insert with check (id = auth.uid());
create policy "tracks public" on public.tracks for select using (status = 'approved' or owner_id = auth.uid());
create policy "tracks owner update" on public.tracks for update using (owner_id = auth.uid());
create policy "tracks owner insert" on public.tracks for insert with check (owner_id = auth.uid());
create policy "Admins can select any beat" on public.beats for select using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));
create policy "Admins can update any beat" on public.beats for update using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));
create policy "Approved beats are public, owners see their own" on public.beats for select using (status = 'approved' or owner_id = auth.uid());
create policy "Owners can update their own beats" on public.beats for update using (owner_id = auth.uid());
create policy "Owners can upload beats" on public.beats for insert with check (owner_id = auth.uid());
create policy "Admins can select any purchase" on public.purchases for select using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));
create policy "Admins can update any purchase" on public.purchases for update using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));
create policy "Artists can view purchases of their own items" on public.purchases for select using (((item_type = 'track') and exists (select 1 from tracks where tracks.id = purchases.item_id and tracks.owner_id = auth.uid())) or ((item_type = 'beat') and exists (select 1 from beats where beats.id = purchases.item_id and beats.owner_id = auth.uid())));
create policy "Buyers can view their own or guest purchases" on public.purchases for select using (buyer_id = auth.uid() or buyer_id is null);
create policy "Users can submit purchases as themselves or as guest" on public.purchases for insert with check (buyer_id is null or buyer_id = auth.uid());
grant select, insert, update on all tables in schema public to anon, authenticated;
create function public.increment_purchase_count(p_item_type text, p_item_id bigint) returns void language plpgsql security definer set search_path = public as $$
begin if p_item_type = 'beat' then update beats set purchase_count = purchase_count + 1 where id = p_item_id; else update tracks set purchase_count = purchase_count + 1 where id = p_item_id; end if; end $$;
grant execute on function public.increment_purchase_count(text, bigint) to anon, authenticated;
insert into profiles (id, display_name, is_admin) values
 ('00000000-0000-0000-0000-0000000000a1','Admin',true),('00000000-0000-0000-0000-0000000000b1','Producer',false),
 ('00000000-0000-0000-0000-0000000000c1','Buyer',false),('00000000-0000-0000-0000-0000000000d1','Other',false);
