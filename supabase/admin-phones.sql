-- Lets ADMINS look up users' verified login phone numbers (from auth.users) for support, e.g. to
-- contact a producer about persistent complaints. Nothing is copied into public tables, so the numbers
-- are never exposed to the public API; non-admins who call it get an error. Safe to run more than once.
create or replace function public.admin_user_phones(p_ids uuid[]) returns table (id uuid, phone text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.zami_is_admin() then raise exception 'Not allowed'; end if;
  return query select u.id, u.phone::text from auth.users u where u.id = any(p_ids) and u.phone is not null and u.phone <> '';
end $$;
revoke all on function public.admin_user_phones(uuid[]) from public, anon;
grant execute on function public.admin_user_phones(uuid[]) to authenticated;
notify pgrst, 'reload schema';
