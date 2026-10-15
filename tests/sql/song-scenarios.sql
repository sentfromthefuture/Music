\set ON_ERROR_STOP off
\pset pager off
\pset format unaligned
\pset tuples_only on
\set a1 '00000000-0000-0000-0000-0000000000a1'
\set b1 '00000000-0000-0000-0000-0000000000b1'
\set c1 '00000000-0000-0000-0000-0000000000c1'
\set d1 '00000000-0000-0000-0000-0000000000d1'
reset role;
-- tracks.is_free exists on the real database (the harness table is minimal)
alter table public.tracks add column if not exists is_free boolean default false;
-- run in a clean slate for tracks/purchases created by earlier scenario files
truncate public.purchases restart identity;
delete from public.tracks;
alter table public.tracks alter column id restart with 100;

\echo '=== SONG LICENSING ==='
\echo '--- S1 producer uploads a song with licenses but WITHOUT the rights confirmation: EXPECT ERROR'
set role authenticated; select set_config('request.jwt.claim.sub', :'b1', false) \g /dev/null
insert into tracks (owner_id, title, price, is_free, status, license_tiers)
  values (:'b1', 'No Rights', 0, true, 'pending_payment', '{"creator":{"price":50,"months":12,"territory":"zm"}}');
\echo '--- S2 bad inputs: price 0 / duration 7 / territory moon / unknown type: EXPECT 4 ERRORS'
insert into tracks (owner_id, title, is_free, license_rights_confirmed, license_tiers) values (:'b1', 'x', true, true, '{"creator":{"price":0,"months":12,"territory":"zm"}}');
insert into tracks (owner_id, title, is_free, license_rights_confirmed, license_tiers) values (:'b1', 'x', true, true, '{"creator":{"price":50,"months":7,"territory":"zm"}}');
insert into tracks (owner_id, title, is_free, license_rights_confirmed, license_tiers) values (:'b1', 'x', true, true, '{"creator":{"price":50,"months":12,"territory":"moon"}}');
insert into tracks (owner_id, title, is_free, license_rights_confirmed, license_tiers) values (:'b1', 'x', true, true, '{"exclusive":{"price":50,"months":12,"territory":"zm"}}');
\echo '--- S3 valid free song with 3 license types + junk field: EXPECT inserted, junk stripped, agreed_at set'
insert into tracks (owner_id, title, price, is_free, status, license_rights_confirmed, license_tiers)
  values (:'b1', 'Free Jam', 0, true, 'pending_payment', true,
   '{"creator":{"price":50,"months":12,"territory":"zm","evil":"x"},"business":{"price":300,"months":36,"territory":"africa"},"live":{"price":120,"months":0,"territory":"world"}}')
  returning id, license_tiers -> 'creator' as creator, license_agreed_at is not null as agreed;
\echo '--- S4 paid song with NO licenses stays untouched: EXPECT inserted, license_tiers null'
insert into tracks (owner_id, title, price, is_free, status) values (:'b1', 'Paid Plain', 15, false, 'approved') returning id, license_tiers is null as no_licenses;
reset role;
update tracks set status = 'approved' where title = 'Free Jam';
insert into tracks (owner_id, title, price, is_free, status) values (:'b1', 'Hidden', 15, false, 'pending_review');
select id as free_id from tracks where title = 'Free Jam' \gset
select id as paid_id from tracks where title = 'Paid Plain' \gset
select id as hidden_id from tracks where title = 'Hidden' \gset

\echo '--- S5 buyer forges a fulfilled, free license with fake terms: EXPECT requested, amount 300, SL- id, tier null, terms from server'
set role authenticated; select set_config('request.jwt.claim.sub', :'c1', false) \g /dev/null
insert into purchases (buyer_id, buyer_contact, item_id, item_type, amount, status, fulfilled_at, download_url, song_license_tier, license_id, license_terms, buyer_name, reference_number)
  values (:'c1', '+260971', :free_id, 'track', 0, 'fulfilled', now(), 'http://evil', 'business', 'SL-FORGED01', '{"months":0,"territory":"world","title":"fake"}', 'Buyer C', 'S-R1')
  returning status, amount, license_tier is null as beat_tier_null, license_id like 'SL-%' and license_id <> 'SL-FORGED01' as id_ok, download_url is null as no_url,
            license_terms ->> 'title' as title, license_terms ->> 'artist' as artist, license_terms ->> 'months' as months, license_terms ->> 'territory' as territory;
\echo '--- S6 buyer asks for a license type the artist does not offer: EXPECT ERROR'
insert into purchases (buyer_id, buyer_contact, item_id, item_type, amount, song_license_tier, reference_number) values (:'c1', '+260971', :free_id, 'track', 1, 'film', 'S-R2');
\echo '--- S7 buyer buys a license on a song that is not approved: EXPECT ERROR'
insert into purchases (buyer_id, buyer_contact, item_id, item_type, amount, song_license_tier, reference_number) values (:'c1', '+260971', :hidden_id, 'track', 1, 'creator', 'S-R3');
\echo '--- S8 regular purchase of a paid song with forged license data: EXPECT amount 15, no license id, no terms, no tier'
insert into purchases (buyer_id, buyer_contact, item_id, item_type, amount, license_id, license_terms, reference_number) values (:'c1', '+260971', :paid_id, 'track', 0, 'SL-FORGED02', '{"x":1}', 'S-R4')
  returning amount, license_id is null as no_id, license_terms is null as no_terms, song_license_tier is null as no_tier;
\echo '--- S9 buyer edits their own license purchase (terms/status): EXPECT UPDATE 0'
update purchases set license_terms = '{"months":0}', status = 'fulfilled' where id = 1 returning id;
reset role;

\echo '--- S10 admin approves (fulfils) the license; verify works for anon, with frozen terms: EXPECT 1 row'
update purchases set status = 'fulfilled', fulfilled_at = '2026-10-14 10:00+00', download_url = 'http://ok' where id = 1;
set role anon;
select license_id, license_type, buyer_name, song_title, artist_name, months, territory, expires_at from verify_song_license('sl-' || (select substr(license_id, 4) from purchases where id = 1));
reset role;
\echo '--- S11 artist later edits the offer, switches the song to paid and then the song is deleted: EXPECT verify still shows the ORIGINAL frozen terms'
update tracks set license_tiers = '{"business":{"price":999,"months":12,"territory":"zm"}}', is_free = false, price = 20, title = 'Renamed' where id = :free_id;
select license_terms ->> 'title' as frozen_title, license_terms ->> 'months' as frozen_months, amount as frozen_amount from purchases where id = 1;
delete from tracks where id = :free_id;
set role anon;
select song_title, months, territory from verify_song_license((select license_id from purchases where id = 1));
reset role;
\echo '--- S12 license not fulfilled yet / a beat or ordinary purchase id: EXPECT 0 rows each'
insert into tracks (owner_id, title, price, is_free, status, license_rights_confirmed, license_tiers) values (:'b1', 'Second', 0, true, 'approved', true, '{"creator":{"price":40,"months":60,"territory":"zm"}}');
set role authenticated; select set_config('request.jwt.claim.sub', :'c1', false) \g /dev/null
insert into purchases (buyer_id, buyer_contact, item_id, item_type, amount, song_license_tier, buyer_name, reference_number) select :'c1', '+260971', id, 'track', 1, 'creator', 'Buyer C', 'S-R5' from tracks where title = 'Second';
reset role;
set role anon;
select count(*) as pending_license_rows from verify_song_license((select license_id from purchases where reference_number = 'S-R5'));
select count(*) as beat_fn_on_song_id from verify_license((select license_id from purchases where id = 1));
select count(*) as song_fn_on_beat_id from verify_song_license('ZL-NOPE0000');
reset role;

\echo '--- S13 artist clears all licenses (empty options): EXPECT license_tiers null'
update tracks set license_tiers = '{}' where title = 'Second' returning license_tiers is null as cleared, license_agreed_at is null as no_agreement;
\echo '--- S14 owner edits something else on a licensed song: EXPECT ok, agreement time unchanged'
update tracks set license_tiers = '{"creator":{"price":40,"months":60,"territory":"zm"}}' where title = 'Second';
select license_agreed_at as t1 from tracks where title = 'Second' \gset
set role authenticated; select set_config('request.jwt.claim.sub', :'b1', false) \g /dev/null
update tracks set title = 'Second' where title = 'Second';
reset role;
select (license_agreed_at = :'t1') as agreement_unchanged from tracks where title = 'Second';

\echo '--- S15 other user cannot change someone else''s license options: EXPECT UPDATE 0'
set role authenticated; select set_config('request.jwt.claim.sub', :'d1', false) \g /dev/null
update tracks set license_tiers = '{"creator":{"price":1,"months":12,"territory":"world"}}' where title = 'Second' returning id;
reset role;

\echo '--- S16 beats are untouched: a beat purchase carrying a song tier loses it; beat tier flow still prices from the beat'
insert into beats (owner_id, title, price, status, license_tiers) values (:'b1', 'Beat X', 50, 'approved', '{"basic":{"price":50}}');
set role authenticated; select set_config('request.jwt.claim.sub', :'c1', false) \g /dev/null
insert into purchases (buyer_id, buyer_contact, item_id, item_type, amount, license_tier, song_license_tier, license_terms, buyer_name, reference_number)
  select :'c1', '+260971', id, 'beat', 0, 'basic', 'creator', '{"x":1}', 'Buyer C', 'S-R6' from beats where title = 'Beat X'
  returning amount, license_tier, license_id like 'ZL-%' as zl_id, song_license_tier is null as no_song_tier, license_terms is null as no_terms;
reset role;
