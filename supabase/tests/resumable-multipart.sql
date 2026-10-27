begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end; $$;
create temporary table multipart_test(name text primary key,payload jsonb);
grant all on multipart_test to service_role;
grant select on multipart_test to authenticated;
create function pg_temp.multipart_asset(p_name text) returns uuid language sql stable as $$ select (payload->>'asset_id')::uuid from pg_temp.multipart_test where name=p_name; $$;
create function pg_temp.multipart_token(p_name text) returns uuid language sql stable as $$ select (payload->>'op_token')::uuid from pg_temp.multipart_test where name=p_name; $$;
insert into auth.users(id,email) values
('19000000-0000-0000-0000-000000000001','multipart-a-'||gen_random_uuid()||'@example.invalid'),
('19000000-0000-0000-0000-000000000002','multipart-b-'||gen_random_uuid()||'@example.invalid');
update private.user_state set quota_bytes=67108864 where user_id='19000000-0000-0000-0000-000000000001';
insert into public.films(id,owner_id,title) values
('29000000-0000-0000-0000-000000000001','19000000-0000-0000-0000-000000000001','Multipart test A'),
('29000000-0000-0000-0000-000000000002','19000000-0000-0000-0000-000000000002','Multipart test other owner'),
('29000000-0000-0000-0000-000000000003','19000000-0000-0000-0000-000000000001','Multipart test other draft');
set local role service_role;
insert into multipart_test values('a',public.backend_create_multipart('19000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000001','39000000-0000-0000-0000-000000000001',17825792,repeat('a',64)));
select pg_temp.assert_true((select payload->>'part_size'='67108864' and payload->>'part_count'='1' and payload->>'asset_status'='pending' from multipart_test where name='a'),'64MiB slices with final partial part');
select pg_temp.assert_true((select film_asset_id is null from public.films where id='29000000-0000-0000-0000-000000000001'),'unverified session is private association, not film asset');
select pg_temp.assert_true((public.backend_create_multipart('19000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000001','39000000-0000-0000-0000-000000000001',17825792,repeat('a',64))->>'asset_id')::uuid=pg_temp.multipart_asset('a'),'same request idempotent');
select pg_temp.assert_true((public.backend_create_multipart('19000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000001','39000000-0000-0000-0000-000000000002',17825792,repeat('a',64))->>'asset_id')::uuid=pg_temp.multipart_asset('a'),'lost request checkpoint with same full fingerprint reuses active upload');
select pg_temp.assert_true((select count(*)=1 and sum(expected_bytes)=17825792 from private.media_assets where owner_id='19000000-0000-0000-0000-000000000001'),'retries reserve quota once');
update public.films set synopsis='Autosaved metadata',film_asset_id=null where id='29000000-0000-0000-0000-000000000001';
select pg_temp.assert_true(public.backend_multipart('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'))->>'status'='initializing','metadata save preserves private session');

do $$ begin
 begin perform public.backend_create_multipart('19000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000001','39000000-0000-0000-0000-000000000003',17825792,repeat('b',64));raise exception 'FAIL second concurrent draft file';exception when object_not_in_prerequisite_state then null;end;
 begin perform public.backend_create_multipart('19000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000001','39000000-0000-0000-0000-000000000001',17825793,repeat('a',64));raise exception 'FAIL request mutated';exception when invalid_parameter_value then null;end;
 begin perform public.backend_create_multipart('19000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000003','39000000-0000-0000-0000-000000000004',67108864,repeat('a',64));raise exception 'FAIL quota over-reservation';exception when invalid_parameter_value then null;end;
 begin perform public.backend_create_multipart('19000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000002','39000000-0000-0000-0000-000000000004',1,repeat('a',64));raise exception 'FAIL foreign draft';exception when insufficient_privilege then null;end;
 begin perform public.backend_create_multipart('19000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000003','39000000-0000-0000-0000-000000000004',1,'bad');raise exception 'FAIL bad fingerprint';exception when invalid_parameter_value then null;end;
 begin perform public.backend_multipart('19000000-0000-0000-0000-000000000002',pg_temp.multipart_asset('a'));raise exception 'FAIL guessed foreign asset';exception when insufficient_privilege then null;end;
 begin perform public.backend_abort_multipart('19000000-0000-0000-0000-000000000002',pg_temp.multipart_asset('a'));raise exception 'FAIL foreign abort';exception when insufficient_privilege then null;end;
 begin perform public.backend_list_multipart('19000000-0000-0000-0000-000000000002','29000000-0000-0000-0000-000000000001');raise exception 'FAIL foreign list';exception when insufficient_privilege then null;end;
 begin update public.films set film_asset_id=pg_temp.multipart_asset('a') where id='29000000-0000-0000-0000-000000000003';raise exception 'FAIL different draft pending attach';exception when insufficient_privilege then null;end;
 begin perform public.backend_sign_multipart('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'));raise exception 'FAIL sign before initiation';exception when insufficient_privilege then null;end;
 begin perform public.backend_claim_multipart_operation('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'),'complete');raise exception 'FAIL complete before initiation';exception when invalid_parameter_value then null;end;
end $$;
insert into multipart_test values('init',public.backend_claim_multipart_operation('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'),'initialize'));
select pg_temp.assert_true((select a.promotion_token=pg_temp.multipart_token('init') and a.promotion_until>now()+interval '4 minutes' from private.media_assets a where a.id=pg_temp.multipart_asset('a')),'writer registers cleanup promotion lease');
do $$ begin
 begin perform public.backend_claim_multipart_operation('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'),'initialize');raise exception 'FAIL concurrent writer';exception when object_not_in_prerequisite_state then null;end;
 begin perform public.backend_initialize_multipart('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'),gen_random_uuid(),'provider-a');raise exception 'FAIL wrong token';exception when insufficient_privilege then null;end;
end $$;
select public.backend_initialize_multipart('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'),pg_temp.multipart_token('init'),'provider-a');
select pg_temp.assert_true(public.backend_sign_multipart('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'))->>'status'='uploading','initialized upload permits bounded signature refresh');
select pg_temp.assert_true((select last_signature_expires_at>now()+interval '9 minutes' from private.multipart_uploads where asset_id=pg_temp.multipart_asset('a')),'signature horizon recorded');
insert into multipart_test values('complete',public.backend_claim_multipart_operation('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'),'complete'));
-- A canonical incomplete parts list can safely return a live completing lease to
-- uploading before any provider completion begins. Expired/stale releases fail.
update private.multipart_uploads set op_until=now()-interval '1 second' where asset_id=pg_temp.multipart_asset('a');
update private.media_assets set promotion_until=now()-interval '1 second' where id=pg_temp.multipart_asset('a');
do $$ begin
 begin perform public.backend_release_multipart_operation('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'),pg_temp.multipart_token('complete'));raise exception 'FAIL expired completion release';exception when insufficient_privilege then null;end;
end $$;
insert into multipart_test values('release-current',public.backend_claim_multipart_operation('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'),'complete'));
select public.backend_release_multipart_operation('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'),pg_temp.multipart_token('release-current'));
select pg_temp.assert_true(public.backend_sign_multipart('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'))->>'status'='uploading','pre-complete validation release immediately permits signing retries');
select pg_temp.assert_true((select promotion_token is null and promotion_until is null from private.media_assets where id=pg_temp.multipart_asset('a')),'release clears writer reservation');
insert into multipart_test values('complete-final',public.backend_claim_multipart_operation('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'),'complete'));
do $$ begin
 begin perform public.backend_release_multipart_operation('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'),pg_temp.multipart_token('release-current'));raise exception 'FAIL stale completion release';exception when insufficient_privilege then null;end;
end $$;
select pg_temp.assert_true(public.backend_multipart('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'))->>'op_token'=pg_temp.multipart_token('complete-final')::text,'stale release cannot clear a newer writer');
select public.backend_complete_multipart('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'),pg_temp.multipart_token('complete-final'));
select pg_temp.assert_true(public.backend_multipart('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'))->>'asset_status'='pending','R2 assembly does not claim MP4 verification');
select pg_temp.assert_true(public.backend_claim_multipart_operation('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'),'complete')->>'status'='completed','completion response loss is reconcilable');
-- Simulate trusted verification result without claiming any real bytes were inspected.
update private.media_assets set status='uploaded',actual_bytes=expected_bytes where id=pg_temp.multipart_asset('a');
update public.films set film_asset_id=pg_temp.multipart_asset('a') where id='29000000-0000-0000-0000-000000000003';
select pg_temp.assert_true((select film_asset_id=pg_temp.multipart_asset('a') from public.films where id='29000000-0000-0000-0000-000000000003'),'verified owned assets remain reusable');
do $$ begin
 begin perform public.backend_abort_multipart('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'));raise exception 'FAIL abort verified source';exception when insufficient_privilege then null;end;
end $$;

insert into multipart_test values('b',public.backend_create_multipart('19000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000001','39000000-0000-0000-0000-000000000005',17825792,repeat('b',64)));
insert into multipart_test values('stale',public.backend_claim_multipart_operation('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('b'),'initialize'));
update private.multipart_uploads set op_until=now()-interval '1 second' where asset_id=pg_temp.multipart_asset('b');
update private.media_assets set promotion_until=now()-interval '1 second' where id=pg_temp.multipart_asset('b');
do $$ begin
 begin perform public.backend_initialize_multipart('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('b'),pg_temp.multipart_token('stale'),'stale-provider');raise exception 'FAIL expired callback';exception when insufficient_privilege then null;end;
end $$;
insert into multipart_test values('new',public.backend_claim_multipart_operation('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('b'),'initialize'));
select pg_temp.assert_true(pg_temp.multipart_token('new')<>pg_temp.multipart_token('stale'),'expired writer has a new CAS token');
select public.backend_abort_multipart('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('b'));
select pg_temp.assert_true((select multipart and available_at>now()+interval '9 minutes' and private_delete_after>now()+interval '23 hours' from private.media_jobs where asset_id=pg_temp.multipart_asset('b')),'multipart cleanup preserves writer grace separately from resume deadline');
select pg_temp.assert_true(public.backend_multipart('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('b'))->>'status'='aborting','status meaningful during abort');
do $$ begin
 begin perform public.backend_initialize_multipart('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('b'),pg_temp.multipart_token('new'),'late-provider');raise exception 'FAIL callback after abort';exception when insufficient_privilege then null;end;
 begin perform public.backend_sign_multipart('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('b'));raise exception 'FAIL sign after abort';exception when insufficient_privilege then null;end;
end $$;
update private.media_assets set status='rejected' where id=pg_temp.multipart_asset('b');
select pg_temp.assert_true(public.backend_multipart('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('b'))->>'status'='aborted','trusted cleanup rejection closes session');
insert into multipart_test values('c',public.backend_create_multipart('19000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000003','39000000-0000-0000-0000-000000000006',1,repeat('c',64)));
delete from public.films where id='29000000-0000-0000-0000-000000000003';
select pg_temp.assert_true((select multipart and action='delete' from private.media_jobs where asset_id=pg_temp.multipart_asset('c')),'deleting source draft queues privately associated pending upload');
select pg_temp.assert_true((select draft_id is null and status='aborting' from private.multipart_uploads where asset_id=pg_temp.multipart_asset('c')),'source deletion retains abort session without dangling draft FK');
insert into private.media_assets(id,owner_id,kind,object_key,expected_bytes,content_type,expires_at) values('49000000-0000-0000-0000-000000000001','19000000-0000-0000-0000-000000000002','hook','multipart-test-plain-'||gen_random_uuid(),1,'video/mp4',now()+interval '1 hour');
select private.enqueue_media('49000000-0000-0000-0000-000000000001','delete');
select pg_temp.assert_true((select not multipart and private_delete_after>=now()+interval '75 minutes' from private.media_jobs where asset_id='49000000-0000-0000-0000-000000000001'),'ordinary PUT cleanup expiration hold is unchanged');
-- Reservations share the existing owner-wide hourly intent cap, even for rejected assets.
insert into private.media_assets(owner_id,kind,object_key,expected_bytes,content_type,status)
 select '19000000-0000-0000-0000-000000000002','film','multipart-rate-'||gen_random_uuid(),1,'video/mp4','rejected' from generate_series(1,29);
do $$ begin
 begin perform public.backend_create_multipart('19000000-0000-0000-0000-000000000002','29000000-0000-0000-0000-000000000002',gen_random_uuid(),1,repeat('d',64));raise exception 'FAIL hourly upload intent cap';exception when program_limit_exceeded then null;end;
end $$;
insert into private.profile_controls(profile_id,status,reason) values('19000000-0000-0000-0000-000000000002','suspended','SQL test suspension');
do $$ begin
 begin perform public.backend_create_multipart('19000000-0000-0000-0000-000000000002','29000000-0000-0000-0000-000000000002',gen_random_uuid(),1,repeat('d',64));raise exception 'FAIL disabled owner';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform public.backend_multipart('19000000-0000-0000-0000-000000000001',pg_temp.multipart_asset('a'));raise exception 'FAIL client backend RPC';exception when insufficient_privilege then null;end;
 begin perform 1 from private.multipart_uploads;raise exception 'FAIL private multipart rows exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.backend_create_multipart('19000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000001',gen_random_uuid(),1,repeat('a',64));raise exception 'FAIL anonymous multipart authority';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'Multipart reservations, leases, privacy and cleanup assertions passed; fixtures rolled back' as result;
