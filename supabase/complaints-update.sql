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

drop trigger if exists zami_complaints_guard on public.purchase_complaints;
create trigger zami_complaints_guard before update on public.purchase_complaints
  for each row execute function public.zami_complaints_guard();

drop policy if exists "complaints admin update" on public.purchase_complaints;
drop policy if exists "complaints update" on public.purchase_complaints;
create policy "complaints update" on public.purchase_complaints for update
  using (public.zami_is_admin() or producer_id = auth.uid() or buyer_id = auth.uid())
  with check (public.zami_is_admin() or producer_id = auth.uid() or buyer_id = auth.uid());

notify pgrst, 'reload schema';
