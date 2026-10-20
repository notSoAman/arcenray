begin;
select set_config('request.jwt.claims','{"iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1","role":"authenticated"}',true);
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',message; end if;end; $$;
create function pg_temp.denied(statement text) returns void language plpgsql as $$ begin
 begin execute statement;exception when insufficient_privilege or check_violation or invalid_parameter_value or raise_exception then return;end;
 raise exception 'FAIL: expected denial: %',statement;end; $$;
insert into auth.users(id,email) values
('73000000-0000-0000-0000-000000000001','storage-fixture-'||gen_random_uuid()||'@example.invalid'),
('73000000-0000-0000-0000-000000000002','storage-other-'||gen_random_uuid()||'@example.invalid');
select pg_temp.assert_true((select quota_bytes is null from private.user_state where user_id='73000000-0000-0000-0000-000000000001'),'new account has no storage cap');
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true(public.get_my_storage()->'quota_bytes'='null'::jsonb,'API explicitly returns unlimited');
select public.reserve_upload('film',2147483648,'video/mp4');
select public.reserve_upload('film',1073741824,'video/mp4');
select public.reserve_upload('poster',1000,'image/webp');
select pg_temp.assert_true((public.get_my_storage()->>'reserved_bytes')::bigint=3221226472,'single uploads exceed old account cap and keep exact accounting');
select pg_temp.denied($q$select public.reserve_upload('film',2147483649,'video/mp4')$q$);
select pg_temp.denied($q$select public.reserve_upload('hook',52428801,'video/mp4')$q$);
select pg_temp.denied($q$select public.reserve_upload('film',1024,'video/webm')$q$);
select pg_temp.denied($q$update private.user_state set quota_bytes=null where user_id='73000000-0000-0000-0000-000000000001'$q$);
reset role;
insert into public.films(id,owner_id,title) values
('74000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001','Unlimited storage fixture'),
('74000000-0000-0000-0000-000000000002','73000000-0000-0000-0000-000000000001','Unlimited second draft fixture');
set local role service_role;
select public.backend_create_multipart('73000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000001',gen_random_uuid(),2147483648,repeat('a',64));
select public.backend_create_multipart('73000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000002',gen_random_uuid(),1073741824,repeat('b',64));
select pg_temp.denied($q$select public.backend_create_multipart('73000000-0000-0000-0000-000000000002','74000000-0000-0000-0000-000000000001',gen_random_uuid(),1,repeat('c',64))$q$);
select pg_temp.denied($q$select public.backend_create_multipart('73000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000001',gen_random_uuid(),2147483649,repeat('c',64))$q$);
select pg_temp.denied($q$select public.backend_create_multipart('73000000-0000-0000-0000-000000000099','74000000-0000-0000-0000-000000000001',gen_random_uuid(),1,repeat('c',64))$q$);
reset role;
set local role authenticated;
select pg_temp.assert_true((public.get_my_storage()->>'reserved_bytes')::bigint=6442451944,'multipart also exceeds old cap without losing reservation tracking');
reset role;
-- A finite administrative cap remains effective, and suspensions are not bypassed.
update private.user_state set quota_bytes=1 where user_id='73000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.denied($q$select public.reserve_upload('poster',1,'image/webp')$q$);
reset role;
insert into private.profile_controls(profile_id,status,reason) values('73000000-0000-0000-0000-000000000001','suspended','storage fixture');
set local role authenticated;
select pg_temp.denied($q$select public.reserve_upload('poster',1,'image/webp')$q$);
reset role;
rollback;
select 'Unlimited account storage, accounting, per-file and access assertions passed; fixtures rolled back' as result;
