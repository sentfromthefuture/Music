-- Fixes "permission denied for table beat_extras / stem_requests / purchase_complaints".
-- New Supabase projects don't automatically let the API roles use tables created in the SQL editor,
-- so these tables need explicit grants. Row-level security (the policies) still decides WHICH rows
-- each person can see or change. Safe to run more than once.
grant select, insert, update, delete on public.beat_extras to authenticated;
grant select, insert, update on public.stem_requests to authenticated;
do $$ begin
  if to_regclass('public.purchase_complaints') is not null then
    execute 'grant select, insert, update on public.purchase_complaints to authenticated';
  end if;
end $$;
notify pgrst, 'reload schema';
