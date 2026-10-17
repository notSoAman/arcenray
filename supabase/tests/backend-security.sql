-- Run inside a transaction; fixtures are always rolled back. Requires postgres on local/staging.
begin;
-- Legacy-account compatibility during the Clerk migration.
select set_config('request.jwt.claims','{"iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1","role":"authenticated"}',true);
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end; $$;
create function pg_temp.expect_denied(statement text) returns void language plpgsql as $$ begin
 begin execute statement; exception when insufficient_privilege or check_violation or invalid_parameter_value or not_null_violation or raise_exception then return; end;
 raise exception 'FAIL: expected denial: %',statement;
 end; $$;
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000000001','backend-a-'||gen_random_uuid()||'@example.invalid'),
 ('10000000-0000-0000-0000-000000000002','backend-b-'||gen_random_uuid()||'@example.invalid'),
 ('10000000-0000-0000-0000-000000000003','backend-c-'||gen_random_uuid()||'@example.invalid');
update public.profiles set full_name='Fixture',roles=array['director'],onboarding_completed=true where id::text like '10000000-%';
insert into public.films(id,owner_id,title) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Private film');
insert into public.film_credits(id,film_id,profile_id,display_name,role) values('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','Fixture B','editor');
set local role anon;
select pg_temp.assert_true((select count(*)=0 from public.films),'anonymous cannot read drafts');
select pg_temp.expect_denied($q$select public.reserve_upload('film',1,'video/mp4')$q$);
select pg_temp.expect_denied('select * from private.user_state');
select pg_temp.assert_true((select count(*)=0 from public.get_personalized_feed()),'empty anonymous feed');
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=1 from public.films),'owner reads draft');
select pg_temp.expect_denied($q$update public.films set status='published'$q$);
select pg_temp.expect_denied($q$update public.profiles set profile_pic_key='forged'$q$);
select pg_temp.expect_denied($q$select public.publish_film('20000000-0000-0000-0000-000000000001')$q$);
select pg_temp.expect_denied($q$select public.respond_to_credit('30000000-0000-0000-0000-000000000001',true)$q$);
select pg_temp.expect_denied($q$insert into public.films(owner_id,title,source) values('10000000-0000-0000-0000-000000000001','Invalid external','vimeo_embed')$q$);
select pg_temp.expect_denied($q$insert into public.conversation_participants(conversation_id,user_id) values(gen_random_uuid(),'10000000-0000-0000-0000-000000000001')$q$);
select public.open_conversation('10000000-0000-0000-0000-000000000002');
select pg_temp.assert_true((select count(*)=2 from public.conversation_participants),'conversation membership created');
select public.open_conversation('10000000-0000-0000-0000-000000000002');
select pg_temp.assert_true((select count(*)=1 from public.conversations),'conversation pair idempotent');
insert into public.messages(conversation_id,sender_id,body) select id,'10000000-0000-0000-0000-000000000001','Hello fixture' from public.conversations;
select pg_temp.expect_denied($q$insert into public.messages(conversation_id,sender_id,body) select id,'10000000-0000-0000-0000-000000000002','Impersonation' from public.conversations$q$);
select public.reserve_upload('film',2147483648,'video/mp4');
select pg_temp.expect_denied($q$select public.reserve_upload('film',1,'video/mp4')$q$);
select pg_temp.assert_true((public.get_my_storage()->>'reserved_bytes')::bigint=2147483648,'quota reservation exact');
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.messages),'third user cannot read messages');
select pg_temp.assert_true((select count(*)=0 from public.conversations),'third user cannot read conversations');
select pg_temp.assert_true((select count(*)=0 from public.films),'third user cannot read draft');
select pg_temp.expect_denied($q$select public.publish_film('20000000-0000-0000-0000-000000000001')$q$);
select pg_temp.expect_denied($q$insert into public.messages(conversation_id,sender_id,body) values((select id from public.conversations limit 1),'10000000-0000-0000-0000-000000000003','Intruder')$q$);
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select public.respond_to_credit('30000000-0000-0000-0000-000000000001',true);
insert into public.user_blocks(blocker_id,blocked_id) values('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
select pg_temp.assert_true((select count(*)=0 from public.messages),'blocking hides conversation');
select pg_temp.expect_denied($q$select public.open_conversation('10000000-0000-0000-0000-000000000001')$q$);
reset role;
rollback;
select 'Backend security assertions passed; fixtures rolled back' as result;
