-- Database-only transactional tests. No storage HTTP calls; fixtures are rolled back.
begin;
-- Legacy-account compatibility during the Clerk migration.
select set_config('request.jwt.claims','{"iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1","role":"authenticated"}',true);
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end; $$;
insert into auth.users(id,email) values('11000000-0000-0000-0000-000000000001','media-lifecycle-'||gen_random_uuid()||'@example.invalid');
insert into private.media_assets(id,owner_id,kind,object_key,expected_bytes,actual_bytes,content_type,status,expires_at,created_at) values
 ('21000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','film','fixture/expired',100,null,'video/mp4','pending',now()-interval '2 hours',now()-interval '3 hours'),
 ('21000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000001','film','fixture/ready',50,50,'video/mp4','ready',now(),now()),
 ('21000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000001','film','fixture/unattached',20,20,'video/mp4','uploaded',now()-interval '1 day',now()-interval '2 days'),
 ('21000000-0000-0000-0000-000000000004','11000000-0000-0000-0000-000000000001','film','fixture/attached',30,30,'video/mp4','uploaded',now()-interval '1 day',now()-interval '2 days');
insert into public.films(owner_id,title,film_asset_id) values('11000000-0000-0000-0000-000000000001','Attached fixture','21000000-0000-0000-0000-000000000004');
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true((public.get_my_storage()->>'used_bytes')::bigint=100,'initial used bytes');
select pg_temp.assert_true((public.get_my_storage()->>'reserved_bytes')::bigint=100,'initial pending reservation');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.backend_claim_expired_assets()','execute'),'cleanup is service-only');
reset role;
select pg_temp.assert_true((select count(*)=2 from public.backend_claim_expired_assets() where owner_id='11000000-0000-0000-0000-000000000001'),'only expired pending and unattached verified assets claimed');
select pg_temp.assert_true((select status='uploaded' from private.media_assets where id='21000000-0000-0000-0000-000000000004'),'attached media preserved');
set local role authenticated;
select pg_temp.assert_true((public.get_my_storage()->>'reserved_bytes')::bigint=120,'deleting bytes stay reserved');
select pg_temp.assert_true((public.get_my_storage()->>'used_bytes')::bigint=80,'deleting bytes moved from used to reserved');
reset role;
select public.backend_release_asset('21000000-0000-0000-0000-000000000001');
select public.backend_release_asset('21000000-0000-0000-0000-000000000003');
set local role authenticated;
select pg_temp.assert_true((public.get_my_storage()->>'reserved_bytes')::bigint=0,'quota released after confirmed object deletion');
reset role;
select pg_temp.assert_true((select count(*)=1 from public.backend_duplicate_sources() where id='21000000-0000-0000-0000-000000000002'),'ready duplicate source queued');
select public.backend_source_deleted('21000000-0000-0000-0000-000000000002');
select pg_temp.assert_true((select count(*)=0 from public.backend_duplicate_sources() where id='21000000-0000-0000-0000-000000000002'),'duplicate source bookkeeping idempotent');
rollback;
select 'Media lifecycle assertions passed; fixtures rolled back' as result;
