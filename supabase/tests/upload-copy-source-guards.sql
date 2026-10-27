begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end; $$;
insert into auth.users(id,email) values('1b000000-0000-0000-0000-000000000001','copy-snapshot-'||gen_random_uuid()||'@example.invalid');
insert into public.films(id,owner_id,title) values('2b000000-0000-0000-0000-000000000001','1b000000-0000-0000-0000-000000000001','Copy snapshot test');
insert into private.media_assets(id,owner_id,kind,object_key,expected_bytes,actual_bytes,content_type,status,etag,expires_at) values
('4b000000-0000-0000-0000-000000000001','1b000000-0000-0000-0000-000000000001','film','1b000000-0000-0000-0000-000000000001/5b000000-0000-0000-0000-000000000001',100,100,'video/mp4','uploaded','"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-6"',now()+interval '1 hour'),
('4b000000-0000-0000-0000-000000000002','1b000000-0000-0000-0000-000000000001','film','1b000000-0000-0000-0000-000000000001/5b000000-0000-0000-0000-000000000002',100,100,'video/mp4','ready','"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-6"',now()+interval '1 day'),
('4b000000-0000-0000-0000-000000000003','1b000000-0000-0000-0000-000000000001','poster','1b000000-0000-0000-0000-000000000001/5b000000-0000-0000-0000-000000000003',100,100,'image/webp','ready','"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',now()+interval '1 hour');
insert into private.multipart_uploads(asset_id,owner_id,draft_id,request_id,fingerprint,upload_id,status) values('4b000000-0000-0000-0000-000000000002','1b000000-0000-0000-0000-000000000001','2b000000-0000-0000-0000-000000000001','3b000000-0000-0000-0000-000000000001',repeat('a',64),'provider-test','uploading');
do $$ begin
 begin perform public.backend_begin_promotion('4b000000-0000-0000-0000-000000000001','1b000000-0000-0000-0000-000000000001');raise exception 'FAIL promotion before processing';exception when object_not_in_prerequisite_state then null;end;
end $$;
-- Simulate an already verified processing result for the copy lifecycle tests.
insert into private.media_processing_jobs(asset_id,owner_id,draft_id,source_key,source_etag,source_bytes,state)
values('4b000000-0000-0000-0000-000000000001','1b000000-0000-0000-0000-000000000001','2b000000-0000-0000-0000-000000000001','fixture-source','fixture-etag',100,'complete');
select set_config('copy.test.token',public.backend_begin_promotion('4b000000-0000-0000-0000-000000000001','1b000000-0000-0000-0000-000000000001')::text,true);
set local role service_role;
do $$ begin
 begin perform public.backend_finish_promotion('4b000000-0000-0000-0000-000000000001','1b000000-0000-0000-0000-000000000001',current_setting('copy.test.token')::uuid);raise exception 'FAIL legacy promotion trusts source ETag';exception when object_not_in_prerequisite_state then null;end;
 begin perform public.backend_finish_promotion('4b000000-0000-0000-0000-000000000001','1b000000-0000-0000-0000-000000000001',gen_random_uuid(),'"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',100,'video/mp4');raise exception 'FAIL stale promotion token';exception when object_not_in_prerequisite_state then null;end;
 begin perform public.backend_finish_promotion('4b000000-0000-0000-0000-000000000001','1b000000-0000-0000-0000-000000000001',current_setting('copy.test.token')::uuid,'"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',101,'video/mp4');raise exception 'FAIL wrong copy size';exception when invalid_parameter_value then null;end;
 begin perform public.backend_finish_promotion('4b000000-0000-0000-0000-000000000001','1b000000-0000-0000-0000-000000000001',current_setting('copy.test.token')::uuid,'"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',100,'image/webp');raise exception 'FAIL wrong copy MIME';exception when invalid_parameter_value then null;end;
end $$;
select public.backend_finish_promotion('4b000000-0000-0000-0000-000000000001','1b000000-0000-0000-0000-000000000001',current_setting('copy.test.token')::uuid,'"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',100,'video/mp4');
select pg_temp.assert_true((select status='ready' and etag='"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-6"' and public_etag='"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"' from private.media_assets where id='4b000000-0000-0000-0000-000000000001'),'source composite ETag retained independently of public destination');
select private.enqueue_media('4b000000-0000-0000-0000-000000000001','quarantine');
select pg_temp.assert_true((select etag='"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"' and source_etag='"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-6"' from private.media_jobs where asset_id='4b000000-0000-0000-0000-000000000001'),'queued job pins distinct public and original snapshots');
update private.media_jobs set state='processing',lease_until=now()+interval '5 minutes' where asset_id='4b000000-0000-0000-0000-000000000001';
select set_config('copy.test.version',(select version::text from private.media_jobs where asset_id='4b000000-0000-0000-0000-000000000001'),true);
select pg_temp.assert_true(not public.backend_record_media_copy('4b000000-0000-0000-0000-000000000001',current_setting('copy.test.version')::bigint+1,'private','"cccccccccccccccccccccccccccccccc"',100,'video/mp4'),'stale job cannot checkpoint');
select pg_temp.assert_true(not public.backend_record_media_copy('4b000000-0000-0000-0000-000000000001',current_setting('copy.test.version')::bigint,'public','"cccccccccccccccccccccccccccccccc"',100,'video/mp4'),'quarantine cannot authorize public restoration snapshot');
do $$ begin
 begin perform public.backend_record_media_copy('4b000000-0000-0000-0000-000000000001',current_setting('copy.test.version')::bigint,'private','"cccccccccccccccccccccccccccccccc"',101,'video/mp4');raise exception 'FAIL checkpoint byte mismatch';exception when invalid_parameter_value then null;end;
end $$;
select pg_temp.assert_true(public.backend_record_media_copy('4b000000-0000-0000-0000-000000000001',current_setting('copy.test.version')::bigint,'private','"cccccccccccccccccccccccccccccccc"',100,'video/mp4'),'valid quarantine destination checkpoint accepted');
select pg_temp.assert_true((select quarantine_etag='"cccccccccccccccccccccccccccccccc"' from private.media_assets where id='4b000000-0000-0000-0000-000000000001'),'backup identity persisted independently');
select public.backend_finish_media_job('4b000000-0000-0000-0000-000000000001',current_setting('copy.test.version')::bigint);
select private.enqueue_media('4b000000-0000-0000-0000-000000000001','restore');
select pg_temp.assert_true((select backup_etag='"cccccccccccccccccccccccccccccccc"' from private.media_jobs where asset_id='4b000000-0000-0000-0000-000000000001'),'restore job retains exact quarantine destination');
update private.media_jobs set state='processing',lease_until=now()-interval '1 second' where asset_id='4b000000-0000-0000-0000-000000000001';
select set_config('copy.test.version',(select version::text from private.media_jobs where asset_id='4b000000-0000-0000-0000-000000000001'),true);
select pg_temp.assert_true(not public.backend_record_media_copy('4b000000-0000-0000-0000-000000000001',current_setting('copy.test.version')::bigint,'public','"dddddddddddddddddddddddddddddddd"',100,'video/mp4'),'expired copy worker cannot checkpoint');
update private.media_jobs set lease_until=now()+interval '5 minutes' where asset_id='4b000000-0000-0000-0000-000000000001';
select pg_temp.assert_true(public.backend_record_media_copy('4b000000-0000-0000-0000-000000000001',current_setting('copy.test.version')::bigint,'public','"dddddddddddddddddddddddddddddddd"',100,'video/mp4'),'restored destination persisted before backup removal');
select pg_temp.assert_true((select etag='"dddddddddddddddddddddddddddddddd"' and source_etag='"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-6"' from private.media_jobs where asset_id='4b000000-0000-0000-0000-000000000001'),'restore updates public identity but retains source');

select public.backend_source_deleted('4b000000-0000-0000-0000-000000000003');
select pg_temp.assert_true((select not source_deleted from private.media_assets where id='4b000000-0000-0000-0000-000000000003'),'ordinary signed PUT can replay so deletion is not final during hold');
select pg_temp.assert_true(not exists(select 1 from public.backend_duplicate_sources() where id='4b000000-0000-0000-0000-000000000003'),'duplicate cleanup waits for ordinary PUT hold');
update private.media_assets set expires_at=now()-interval '16 minutes' where id='4b000000-0000-0000-0000-000000000003';
select pg_temp.assert_true(exists(select 1 from public.backend_duplicate_sources() where id='4b000000-0000-0000-0000-000000000003'),'source stays eligible after hold for final replay deletion');
select public.backend_source_deleted('4b000000-0000-0000-0000-000000000003');
select pg_temp.assert_true((select source_deleted from private.media_assets where id='4b000000-0000-0000-0000-000000000003'),'ordinary source finalized after hold');
select public.backend_source_deleted('4b000000-0000-0000-0000-000000000002');
select pg_temp.assert_true((select not source_deleted from private.media_assets where id='4b000000-0000-0000-0000-000000000002'),'unclosed multipart does not bypass safety hold');
update private.multipart_uploads set status='completed' where asset_id='4b000000-0000-0000-0000-000000000002';
select pg_temp.assert_true(exists(select 1 from public.backend_duplicate_sources() where id='4b000000-0000-0000-0000-000000000002'),'closed completed multipart permits immediate duplicate cleanup');
select public.backend_source_deleted('4b000000-0000-0000-0000-000000000002');
select pg_temp.assert_true((select source_deleted from private.media_assets where id='4b000000-0000-0000-0000-000000000002'),'closed multipart source finalized without 24-hour hold');
reset role;
set local role authenticated;
do $$ begin
 begin perform public.backend_record_media_copy('4b000000-0000-0000-0000-000000000001',1,'public','"dddddddddddddddddddddddddddddddd"',100,'video/mp4');raise exception 'FAIL client snapshot authority';exception when insufficient_privilege then null;end;
 begin perform public.backend_finish_promotion('4b000000-0000-0000-0000-000000000001','1b000000-0000-0000-0000-000000000001',gen_random_uuid(),'"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',100,'video/mp4');raise exception 'FAIL client promotion authority';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'Copy snapshots, lifecycle lease CAS and source replay hold assertions passed; fixtures rolled back' as result;
