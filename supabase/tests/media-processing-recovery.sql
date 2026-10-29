begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end; $$;
insert into auth.users(id,email) values
 ('ab000000-0000-4000-8000-000000000001','processing-recovery-'||gen_random_uuid()||'@example.invalid');
insert into public.films(id,owner_id,title) values
 ('ab000000-0000-4000-8000-000000000002','ab000000-0000-4000-8000-000000000001','Processing recovery fixture');
insert into private.media_assets(id,owner_id,kind,object_key,expected_bytes,actual_bytes,etag,content_type,status,expires_at)
values ('ab000000-0000-4000-8000-000000000003','ab000000-0000-4000-8000-000000000001','film','fixture/original',100,100,'source-etag','video/mp4','uploaded',now()+interval '1 hour');
update public.films set film_asset_id='ab000000-0000-4000-8000-000000000003' where id='ab000000-0000-4000-8000-000000000002';
insert into private.media_processing_jobs(id,asset_id,owner_id,draft_id,source_key,source_etag,source_bytes,state,attempts,lease_token,lease_until,output_key)
values('ab000000-0000-4000-8000-000000000004','ab000000-0000-4000-8000-000000000003','ab000000-0000-4000-8000-000000000001',
 'ab000000-0000-4000-8000-000000000002','fixture/original','source-etag',100,'processing',1,'ab000000-0000-4000-8000-000000000005',now()+interval '5 minutes','fixture/output');

set local role service_role;
select pg_temp.assert_true(public.backend_heartbeat_media_processing_progress('ab000000-0000-4000-8000-000000000004','ab000000-0000-4000-8000-000000000005','encoding'),'live owner lease reports progress');
select pg_temp.assert_true(not public.backend_heartbeat_media_processing_progress('ab000000-0000-4000-8000-000000000004',gen_random_uuid(),'uploading'),'stale lease cannot overwrite progress');
select pg_temp.assert_true((select stage='encoding' from private.media_processing_jobs where id='ab000000-0000-4000-8000-000000000004'),'progress kept after stale token');
select public.backend_fail_media_processing_job('ab000000-0000-4000-8000-000000000004','ab000000-0000-4000-8000-000000000005','multiple_tracks');
select pg_temp.assert_true((select state='failed' and attempts=1 and last_error='multiple_tracks' and lease_token is null from private.media_processing_jobs where id='ab000000-0000-4000-8000-000000000004'),'unsupported film fails once without repeated downloads');
update private.media_processing_jobs set state='processing',lease_token='ab000000-0000-4000-8000-000000000005',lease_until=now()+interval '5 minutes' where id='ab000000-0000-4000-8000-000000000004';
select public.backend_fail_media_processing_job('ab000000-0000-4000-8000-000000000004','ab000000-0000-4000-8000-000000000005','storage');
select pg_temp.assert_true((select state='queued' and available_at>now() from private.media_processing_jobs where id='ab000000-0000-4000-8000-000000000004'),'temporary storage failure retains bounded backoff');
update private.media_processing_jobs set state='complete',output_etag='output-etag',output_bytes=50,output_sha256=repeat('a',64) where id='ab000000-0000-4000-8000-000000000004';
select pg_temp.assert_true((public.backend_processing_output('ab000000-0000-4000-8000-000000000004','ab000000-0000-4000-8000-000000000005')->>'completed')::boolean,'lost completion reply can be reconciled');
reset role;

select set_config('request.jwt.claims','{"sub":"ab000000-0000-4000-8000-000000000001","role":"authenticated","iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1"}',true);
set local role authenticated;
select pg_temp.assert_true(public.get_media_processing_state('ab000000-0000-4000-8000-000000000003')->>'state'='complete','owner sees processing status');
do $$ begin
 begin
  perform public.backend_heartbeat_media_processing_progress('ab000000-0000-4000-8000-000000000004','ab000000-0000-4000-8000-000000000005','uploading');
  raise exception 'FAIL client progressed a job';
 exception when insufficient_privilege then null; end;
end; $$;
reset role;
select set_config('request.jwt.claims','{"sub":"ab000000-0000-4000-8000-000000000009","role":"authenticated","iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1"}',true);
set local role authenticated;
select pg_temp.assert_true(public.get_media_processing_state('ab000000-0000-4000-8000-000000000003') is null,'other users cannot see private job status');
reset role;
set local role anon;
do $$ begin
 begin
  perform public.backend_heartbeat_media_processing_progress('ab000000-0000-4000-8000-000000000004','ab000000-0000-4000-8000-000000000005','uploading');
  raise exception 'FAIL anonymous job write';
 exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
select 'Processing progress, terminal failure, recovery and denial assertions passed; fixtures rolled back' as result;
