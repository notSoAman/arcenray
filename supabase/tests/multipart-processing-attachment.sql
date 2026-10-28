begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end $$;
insert into auth.users(id,email) values
 ('aa000000-0000-4000-8000-000000000001','qa-attach-'||gen_random_uuid()||'@example.invalid'),
 ('aa000000-0000-4000-8000-000000000002','qa-other-'||gen_random_uuid()||'@example.invalid');
insert into public.films(id,owner_id,title) values
 ('bb000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','Attachment test'),
 ('bb000000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-000000000001','Existing film test'),
 ('bb000000-0000-4000-8000-000000000003','aa000000-0000-4000-8000-000000000002','Foreign film test');
insert into private.media_assets(id,owner_id,kind,object_key,expected_bytes,content_type,status,expires_at) values
 ('cc000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','film','fixture/one',100,'video/mp4','pending',now()+interval '1 hour'),
 ('cc000000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-000000000001','film','fixture/two',100,'video/mp4','pending',now()+interval '1 hour'),
 ('cc000000-0000-4000-8000-000000000003','aa000000-0000-4000-8000-000000000001','film','fixture/three',100,'video/mp4','pending',now()+interval '1 hour'),
 ('cc000000-0000-4000-8000-000000000004','aa000000-0000-4000-8000-000000000001','film','fixture/four',100,'video/mp4','pending',now()+interval '1 hour'),
 ('cc000000-0000-4000-8000-000000000005','aa000000-0000-4000-8000-000000000001','film','fixture/existing',100,'video/mp4','uploaded',now()+interval '1 hour');
update public.films set film_asset_id='cc000000-0000-4000-8000-000000000005' where id='bb000000-0000-4000-8000-000000000002';
insert into private.multipart_uploads(asset_id,owner_id,draft_id,request_id,fingerprint,status) values
 ('cc000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64),'completed'),
 ('cc000000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000002',gen_random_uuid(),repeat('b',64),'completed'),
 ('cc000000-0000-4000-8000-000000000003','aa000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000003',gen_random_uuid(),repeat('c',64),'completed'),
 ('cc000000-0000-4000-8000-000000000004','aa000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('d',64),'uploading');
set local role service_role;
select public.backend_verify_asset('cc000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001',100,'fixture-etag',1,1,null);
select pg_temp.assert_true((select film_asset_id='cc000000-0000-4000-8000-000000000001' from public.films where id='bb000000-0000-4000-8000-000000000001'),'completed upload attaches to its draft');
select pg_temp.assert_true((select state='queued' from private.media_processing_jobs where asset_id='cc000000-0000-4000-8000-000000000001'),'processing is queued');
select public.backend_verify_asset('cc000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001',100,'fixture-etag',1,1,null);
do $$ begin
 begin perform public.backend_verify_asset('cc000000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-000000000001',100,'fixture-etag',1,1,null); raise exception 'FAIL overwrite existing film'; exception when insufficient_privilege then null; end;
 begin perform public.backend_verify_asset('cc000000-0000-4000-8000-000000000003','aa000000-0000-4000-8000-000000000001',100,'fixture-etag',1,1,null); raise exception 'FAIL foreign draft'; exception when insufficient_privilege then null; end;
 begin perform public.backend_verify_asset('cc000000-0000-4000-8000-000000000004','aa000000-0000-4000-8000-000000000001',100,'fixture-etag',1,1,null); raise exception 'FAIL unfinished upload'; exception when insufficient_privilege then null; end;
end $$;
select pg_temp.assert_true((select count(*)=3 from private.media_assets where id in ('cc000000-0000-4000-8000-000000000002','cc000000-0000-4000-8000-000000000003','cc000000-0000-4000-8000-000000000004') and status='pending'),'failed attachment rolls back verification');
reset role;
set local role authenticated;
do $$ begin
 begin perform public.backend_verify_asset('cc000000-0000-4000-8000-000000000004','aa000000-0000-4000-8000-000000000001',100,'fixture-etag',1,1,null); raise exception 'FAIL client verification'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'Multipart processing attachment and denial assertions passed; fixtures rolled back' as result;
