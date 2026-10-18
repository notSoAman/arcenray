-- Requires the pending direct-write-limits migration; never leaves fixture data.
begin;
select set_config('request.jwt.claims','{"iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1","role":"authenticated"}',true);
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end; $$;
create function pg_temp.expect_rate(statement text) returns void language plpgsql as $$ begin
 begin execute statement; exception when sqlstate '54000' then return; end;
 raise exception 'FAIL expected rate limit: %',statement; end; $$;
create function pg_temp.expect_denied(statement text) returns void language plpgsql as $$ begin
 begin execute statement; exception when insufficient_privilege then return; end;
 raise exception 'FAIL expected access denial: %',statement; end; $$;
insert into auth.users(id,email) select ('16000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'limits-'||n||'-'||gen_random_uuid()||'@example.invalid' from generate_series(1,5) n;
update public.profiles set full_name='Rate-limit fixture',roles=array['director'],onboarding_completed=true where id::text like '16000000-%';
insert into public.films(id,owner_id,title) values('26000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001','Rate limit draft');
insert into public.conversations(id,user_low,user_high) values
('36000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000002'),
('36000000-0000-0000-0000-000000000002','16000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000003');
insert into public.conversation_participants(conversation_id,user_id)
select id,user_low from public.conversations where id::text like '36000000-%' union all
select id,user_high from public.conversations where id::text like '36000000-%';
insert into public.messages(conversation_id,sender_id,body,created_at)
select '36000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001','Busy fixture '||n,'2001-01-01' from generate_series(1,301) n;
insert into public.messages(id,conversation_id,sender_id,body,created_at) values
('46000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001','Tie first','2002-01-01'),
('46000000-0000-0000-0000-000000000002','36000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001','Tie second','2002-01-01'),
('46000000-0000-0000-0000-000000000003','36000000-0000-0000-0000-000000000002','16000000-0000-0000-0000-000000000003','Quiet fixture','2000-01-01');
-- Trusted fixture writes bypass counters. Seed each allowance one call below limit.
select pg_temp.assert_true(not exists(select 1 from private.api_usage where user_id::text like '16000000-%'),'trusted fixture inserts bypass client counters');
insert into private.api_usage(user_id,operation,window_start,calls) values
('16000000-0000-0000-0000-000000000001','write:messages',date_trunc('hour',now()),999),
('16000000-0000-0000-0000-000000000001','write:reports',date_trunc('hour',now()),9),
('16000000-0000-0000-0000-000000000001','write:follows',date_trunc('hour',now()),99),
('16000000-0000-0000-0000-000000000001','write:credits',date_trunc('hour',now()),99),
('16000000-0000-0000-0000-000000000001','write:conversations',date_trunc('hour',now()),29);
select set_config('request.jwt.claim.sub','16000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=2 from public.get_chat_summaries()),'quiet conversation survives over 300 busy messages');
select pg_temp.assert_true((select id='46000000-0000-0000-0000-000000000002'::uuid from public.get_chat_summaries() where conversation_id='36000000-0000-0000-0000-000000000001'),'same timestamp chooses greatest UUID');
insert into public.messages(conversation_id,sender_id,body) values('36000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001','Message boundary');
select pg_temp.expect_rate($q$insert into public.messages(conversation_id,sender_id,body) values('36000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001','Over boundary')$q$);
-- Session database role remains authenticated: a claim/metadata privilege flag is
-- not a trusted operations bypass, even inside the SECURITY DEFINER trigger.
select set_config('request.jwt.claims','{"iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1","role":"service_role","user_metadata":{"admin":true}}',true);
select pg_temp.expect_rate($q$insert into public.messages(conversation_id,sender_id,body) values('36000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001','Metadata cannot bypass')$q$);
select set_config('request.jwt.claims','{"iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1","role":"authenticated"}',true);
insert into public.content_reports(reporter_id,profile_id,reason) values('16000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000002','Report boundary');
select pg_temp.expect_rate($q$insert into public.content_reports(reporter_id,profile_id,reason) values('16000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000002','Over boundary')$q$);
insert into public.profile_follows(follower_id,following_id) values('16000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000002');
select pg_temp.expect_rate($q$insert into public.profile_follows(follower_id,following_id) values('16000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000003')$q$);
insert into public.film_credits(film_id,profile_id,display_name,role) values('26000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000002','Fixture peer','editor');
select pg_temp.expect_rate($q$insert into public.film_credits(film_id,display_name,role) values('26000000-0000-0000-0000-000000000001','Over boundary','writer')$q$);
select public.open_conversation('16000000-0000-0000-0000-000000000004');
select public.open_conversation('16000000-0000-0000-0000-000000000004');
select pg_temp.expect_rate($q$select public.open_conversation('16000000-0000-0000-0000-000000000005')$q$);
select pg_temp.expect_denied($q$select public.backend_rate_limit('16000000-0000-0000-0000-000000000002','write:messages',1000)$q$);
reset role;
select pg_temp.assert_true((select calls=30 from private.api_usage where user_id='16000000-0000-0000-0000-000000000001' and operation='write:conversations'),'reopening a pair consumes no quota');
select pg_temp.assert_true(not exists(select 1 from private.api_usage where user_id='16000000-0000-0000-0000-000000000002'),'credit target never charged for owner write');
select set_config('request.jwt.claim.sub','16000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=1 from public.get_chat_summaries()),'summaries exclude another conversation');
select pg_temp.expect_denied($q$insert into public.messages(conversation_id,sender_id,body) values('36000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001','Forged sender')$q$);
insert into public.messages(conversation_id,sender_id,body) values('36000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000002','Independent allowance');
reset role;
select pg_temp.assert_true((select calls=1 from private.api_usage where user_id='16000000-0000-0000-0000-000000000002' and operation='write:messages'),'other actor gets own allowance and rejected writes roll back');
select pg_temp.assert_true((select calls=1000 from private.api_usage where user_id='16000000-0000-0000-0000-000000000001' and operation='write:messages'),'another actor cannot consume exhausted user allowance');
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
set local role anon;
select pg_temp.expect_denied('select public.get_chat_summaries()');
select pg_temp.expect_denied($q$insert into public.messages(conversation_id,sender_id,body) values('36000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001','Anonymous')$q$);
select pg_temp.expect_denied('select * from private.api_usage');
reset role;
rollback;
select 'Direct-write rate limits and chat summary assertions passed; fixtures rolled back' as result;
