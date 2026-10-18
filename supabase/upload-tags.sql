-- Stores what an uploaded audio file says about itself (title, artist, copyright, ISRC...) so the admin
-- reviewing the upload can see it. Adds one nullable column to each existing table (no new table).
-- Safe to run more than once. Until it is run, uploads work as before and the review card just says
-- "File tags: not recorded". The tags come from the file, so treat them as claims, not proof.
alter table public.tracks add column if not exists upload_tags jsonb;
alter table public.beats  add column if not exists upload_tags jsonb;
notify pgrst, 'reload schema';
