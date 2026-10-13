-- Optional: lets admins attach a short note ("what is this withdrawal for?") to each withdrawal.
-- Adds ONE nullable column to the existing table (no new table). Safe to run more than once.
-- Until it is run, the admin withdrawal cards still show "Pay K... (75%)" but hide the note field.
alter table public.withdrawals add column if not exists admin_note text;
