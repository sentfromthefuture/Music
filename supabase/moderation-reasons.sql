-- Lets an admin decline an upload or delete a song WITH A REASON that the artist can read in My Uploads
-- (Duplicate, Not original, ...). Adds two nullable columns to each existing table (no new table).
-- Safe to run more than once. Until it is run, declining/deleting still works but no reason is saved
-- (the admin screen tells you so). Also adds the reason to the rejected-uploads log if that table exists.
alter table public.tracks add column if not exists removed_reason text;
alter table public.tracks add column if not exists removal_kind text;   -- 'declined' | 'deleted'
alter table public.beats  add column if not exists removed_reason text;
alter table public.beats  add column if not exists removal_kind text;
do $$ begin
  if to_regclass('public.upload_rejections') is not null then
    execute 'alter table public.upload_rejections add column if not exists reason text';
  end if;
end $$;
notify pgrst, 'reload schema';
