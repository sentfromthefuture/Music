\set ON_ERROR_STOP off
\pset pager off
\pset format unaligned
\pset tuples_only on
\set a1 '00000000-0000-0000-0000-0000000000a1'
\set b1 '00000000-0000-0000-0000-0000000000b1'
\set c1 '00000000-0000-0000-0000-0000000000c1'
reset role;
\echo '=== UPLOAD REJECTIONS LOG ==='
\echo '--- R1 admin logs a rejection: EXPECT inserted, rejected_by = admin'
set role authenticated; select set_config('request.jwt.claim.sub', :'a1', false) \g /dev/null
insert into upload_rejections (item_type, item_id, owner_id, title, genre, reference_number, transaction_sms) values ('track', '7', :'b1', 'Bad Upload', 'Gospel', 'TRK-AAAA', 'sms text') returning item_type, title, rejected_by = :'a1' as by_admin, rejected_at is not null as dated;
\echo '--- R2 admin reads the log: EXPECT 1'
select count(*) from upload_rejections;
\echo '--- R3 a producer tries to log a fake rejection: EXPECT ERROR (row-level security)'
select set_config('request.jwt.claim.sub', :'b1', false) \g /dev/null
insert into upload_rejections (item_type, item_id, title) values ('track', '8', 'Fake');
\echo '--- R4 a producer / buyer reads the log: EXPECT 0 rows'
select count(*) from upload_rejections;
select set_config('request.jwt.claim.sub', :'c1', false) \g /dev/null
select count(*) from upload_rejections;
\echo '--- R5 anon cannot read or write: EXPECT 0 rows and a blocked insert'
reset role; set role anon;
select count(*) from upload_rejections;
insert into upload_rejections (item_type, item_id) values ('track', '9');
\echo '--- R6 a producer cannot edit or delete the log: EXPECT UPDATE 0 and DELETE 0 (on the real project there is no grant at all)'
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :'b1', false) \g /dev/null
update upload_rejections set title = 'x';
delete from upload_rejections;
\echo '--- R7 bad item type: EXPECT ERROR'
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :'a1', false) \g /dev/null
insert into upload_rejections (item_type, item_id) values ('album', '1');
reset role;
