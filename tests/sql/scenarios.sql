\set ON_ERROR_STOP off
\pset pager off
\pset format unaligned
\pset tuples_only on
\set a1 '00000000-0000-0000-0000-0000000000a1'
\set b1 '00000000-0000-0000-0000-0000000000b1'
\set c1 '00000000-0000-0000-0000-0000000000c1'
\set d1 '00000000-0000-0000-0000-0000000000d1'
\set as_admin    'reset role; select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-0000000000a1'',false) \\g /dev/null\nset role authenticated;'
reset role;
-- a1 admin, b1 producer, c1 buyer, d1 other
\echo '--- T1 producer uploads a beat (pending_payment)'
set role authenticated; select set_config('request.jwt.claim.sub', :'b1', false) \g /dev/null
insert into beats (owner_id, title, price, status) values (:'b1', 'Test Beat', 50, 'pending_payment') returning id, status;
\echo '--- T2 producer tries to self-approve: EXPECT ERROR'
update beats set status = 'approved' where id = 1;
\echo '--- T3 producer submits payment proof: EXPECT UPDATE 1 (pending_review)'
update beats set transaction_sms = 'sms', status = 'pending_review' where id = 1 returning status;
\echo '--- T4 producer edits counters + owner: EXPECT values unchanged (0, producer)'
update beats set purchase_count = 99, play_count = 5000, owner_id = :'d1' where id = 1 returning purchase_count, play_count, owner_id = :'b1' as still_owner;
reset role;
update beats set license_tiers = '{"basic":{"price":50},"premium":{"price":120,"extras":true},"exclusive":{"price":600,"extras":true}}' where id = 1;
\echo '--- T5 admin approves the beat via the site: EXPECT approved'
set role authenticated; select set_config('request.jwt.claim.sub', :'a1', false) \g /dev/null
update beats set status = 'approved' where id = 1 returning status;
reset role;
\echo '--- T6 buyer forges a fulfilled, free purchase: EXPECT status requested, amount 120, license id set, download_url empty'
set role authenticated; select set_config('request.jwt.claim.sub', :'c1', false) \g /dev/null
insert into purchases (buyer_id, buyer_contact, item_id, item_type, amount, status, fulfilled_at, download_url, license_tier, buyer_name, reference_number) values (:'c1', '+260971', 1, 'beat', 0, 'fulfilled', now(), 'http://evil', 'premium', 'Buyer C', 'R1') returning id, status, amount, license_tier, license_id is not null as has_license_id, download_url, fulfilled_at;
\echo '--- T7 buyer edits their own purchase to fulfilled: EXPECT UPDATE 0 (no row)'
update purchases set status = 'fulfilled', amount = 0 where id = 1 returning id;
\echo '--- T8 buyer buys a beat with tiers but no tier: EXPECT ERROR'
insert into purchases (buyer_id, buyer_contact, item_id, item_type, amount, reference_number) values (:'c1', '+260971', 1, 'beat', 1, 'R2');
\echo '--- T9 buyer buys an unapproved beat: EXPECT ERROR'
reset role; insert into beats (owner_id, title, price, status) values (:'b1', 'Hidden', 10, 'pending_payment');
set role authenticated; select set_config('request.jwt.claim.sub', :'c1', false) \g /dev/null
insert into purchases (buyer_id, buyer_contact, item_id, item_type, amount, reference_number) values (:'c1', '+260971', 2, 'beat', 1, 'R3');
reset role;
\echo '--- T10 guest (anon) forges fulfilled on a legacy track: EXPECT requested, amount = track price 15'
insert into tracks (owner_id, title, price, status) values (:'b1', 'Song', 15, 'approved');
select set_config('request.jwt.claim.sub','',false) \g /dev/null
set role anon; 
insert into purchases (buyer_id, buyer_contact, item_id, item_type, amount, status, reference_number) values (null, '+260972', 1, 'track', 1, 'fulfilled', 'G1') returning status, amount, license_id;
\echo '--- T11 FINDING: anon can read guest purchases (phone numbers etc.): EXPECT count >= 1'
select count(*) from purchases;
select buyer_contact from purchases limit 1;
reset role;
\echo '--- T12 admin fulfils the buyer premium purchase; listener d1 calls increment RPC (definer): EXPECT purchase_count = 1'
set role authenticated; select set_config('request.jwt.claim.sub', :'a1', false) \g /dev/null
update purchases set status = 'fulfilled', fulfilled_at = now(), download_url = 'signed' where id = 1 returning status;
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :'d1', false) \g /dev/null
select increment_purchase_count('beat', 1);
reset role; select purchase_count from beats where id = 1;
\echo '--- T13 verify_license (anon): EXPECT 1 row for fulfilled, 0 rows for requested'
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select license_id as lic from purchases where id = 1 \gset
select set_config('request.jwt.claim.sub','',false) \g /dev/null
set role anon; select tier, buyer_name, beat_title, producer_name, extras from verify_license(:'lic');
reset role; select count(*) from verify_license('ZL-NOPE0000');
\echo '--- T14 beat_extras: producer inserts link; premium buyer reads (1); stranger reads (0); producer cannot add for a beat they do not own'
set role authenticated; select set_config('request.jwt.claim.sub', :'b1', false) \g /dev/null
insert into beat_extras (beat_id, link) values ('1', 'https://drive.example/stems') returning beat_id;
select set_config('request.jwt.claim.sub', :'c1', false) \g /dev/null
select count(*) from beat_extras;
select set_config('request.jwt.claim.sub', :'d1', false) \g /dev/null
select count(*) from beat_extras;
reset role; insert into beats (owner_id, title, price, status) values (:'d1', 'Not yours', 5, 'approved');
set role authenticated; select set_config('request.jwt.claim.sub', :'b1', false) \g /dev/null
insert into beat_extras (beat_id, link) values ('3', 'https://evil.example');
\echo '--- T15 stem_requests: buyer ok; stranger ERROR; producer sees + marks delivered'
select set_config('request.jwt.claim.sub', :'c1', false) \g /dev/null
insert into stem_requests (purchase_id, beat_id, producer_id, buyer_name, buyer_contact) values ('1', '1', :'b1', 'Buyer C', '+260971') returning status;
select set_config('request.jwt.claim.sub', :'d1', false) \g /dev/null
insert into stem_requests (purchase_id, beat_id, producer_id, buyer_name, buyer_contact) values ('1', '1', :'b1', 'Evil', '+1');
select set_config('request.jwt.claim.sub', :'b1', false) \g /dev/null
select count(*) from stem_requests;
update stem_requests set status = 'delivered' where purchase_id = '1' returning status;
reset role;
\echo '--- T16 exclusive: buyer buys exclusive, admin fulfils: EXPECT beat exclusive_sold=t status=removed'
set role authenticated; select set_config('request.jwt.claim.sub', :'c1', false) \g /dev/null
insert into purchases (buyer_id, buyer_contact, item_id, item_type, amount, license_tier, buyer_name, reference_number) values (:'c1', '+260971', 1, 'beat', 1, 'exclusive', 'Buyer C', 'R4') returning id, amount;
select set_config('request.jwt.claim.sub', :'a1', false) \g /dev/null
update purchases set status = 'fulfilled', fulfilled_at = now(), download_url = 'signed' where reference_number = 'R4';
reset role; select exclusive_sold, status from beats where id = 1;
\echo '--- T17 after exclusive: anon cannot see the beat (0); buyer still can (1); no recursion'
select set_config('request.jwt.claim.sub','',false) \g /dev/null
set role anon; select count(*) from beats where id = 1;
select set_config('request.jwt.claim.sub', :'c1', false) \g /dev/null
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :'c1', false) \g /dev/null
select count(*) from beats where id = 1;
select count(*) from purchases;
\echo '--- T18 producer tries to relist the exclusive beat: EXPECT ERROR (status) and exclusive_sold stays true'
select set_config('request.jwt.claim.sub', :'b1', false) \g /dev/null
update beats set exclusive_sold = false, status = 'approved' where id = 1;
update beats set exclusive_sold = false where id = 1 returning exclusive_sold;
reset role; \echo '--- T18b final state of the exclusive beat: EXPECT t|removed'
select exclusive_sold, status from beats where id = 1;
set role authenticated;
\echo '--- T19 profiles: user makes self admin: EXPECT is_admin stays false; client insert with is_admin true -> false'
select set_config('request.jwt.claim.sub', :'c1', false) \g /dev/null
update profiles set is_admin = true, display_name = 'Buyer renamed' where id = :'c1' returning is_admin, display_name;
reset role; set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
insert into profiles (id, display_name, is_admin) values ('00000000-0000-0000-0000-0000000000e1', 'Newbie', true) returning is_admin;
\echo '--- T20 admin can still change statuses and counters via the site: EXPECT 1 row'
select set_config('request.jwt.claim.sub', :'a1', false) \g /dev/null
update beats set status = 'removed', removed_at = now() where id = 3 returning status;
reset role;
\echo '--- DONE'
