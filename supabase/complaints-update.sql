-- Producer replies + "Mark as fixed", buyer "Reopen", all enforced by a guard trigger.
-- Run AFTER complaints.sql. Safe to run more than once. (A fresh install can just run complaints.sql,
-- which already includes this.)
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
