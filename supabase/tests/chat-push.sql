begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
insert into auth.users(id,email) values
 ('77000000-0000-4000-8000-000000000001','push-a-'||gen_random_uuid()||'@example.invalid'),
 ('77000000-0000-4000-8000-000000000002','push-b-'||gen_random_uuid()||'@example.invalid'),
 ('77000000-0000-4000-8000-000000000003','push-c-'||gen_random_uuid()||'@example.invalid');
update public.profiles set onboarding_completed=true,full_name='Push QA',roles=array['Director']
where id in ('77000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000002','77000000-0000-4000-8000-000000000003');
insert into public.conversations(id,user_low,user_high)
values('77000000-0000-4000-8000-000000000004','77000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000002');
insert into public.conversation_participants(conversation_id,user_id,last_read_at)
values
 ('77000000-0000-4000-8000-000000000004','77000000-0000-4000-8000-000000000001',now()-interval '1 hour'),
 ('77000000-0000-4000-8000-000000000004','77000000-0000-4000-8000-000000000002',now()-interval '1 hour')
on conflict(conversation_id,user_id) do update set last_read_at=excluded.last_read_at;

set local role authenticated;
select pg_temp.assert(not has_function_privilege(current_user,'public.backend_claim_chat_push_jobs()','execute'),'client cannot claim tokens');
select pg_temp.assert(not has_function_privilege(current_user,'public.backend_manage_chat_push_device(uuid,uuid,text)','execute'),'client cannot register for another actor');
select pg_temp.assert(not has_table_privilege(current_user,'private.chat_push_devices','select'),'client cannot read device tokens');
reset role;
set local role anon;
select pg_temp.assert(not has_function_privilege(current_user,'public.backend_finish_chat_push_job(uuid,uuid,text,text)','execute'),'guest cannot finish deliveries');
reset role;

set local role service_role;
select pg_temp.assert(public.backend_manage_chat_push_device('77000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000011','ExpoPushToken[TestSender]'),'sender registers');
select pg_temp.assert(public.backend_manage_chat_push_device('77000000-0000-4000-8000-000000000002','77000000-0000-4000-8000-000000000012','ExpoPushToken[TestReceiver]'),'recipient registers');
select pg_temp.assert(not public.backend_manage_chat_push_device('77000000-0000-4000-8000-000000000003','77000000-0000-4000-8000-000000000013','ExpoPushToken[TestReceiver]'),'token alone cannot transfer a device');
select pg_temp.assert(public.backend_manage_chat_push_device('77000000-0000-4000-8000-000000000003','77000000-0000-4000-8000-000000000012'),'other user revoke is a harmless no-op');
reset role;

insert into public.messages(id,conversation_id,sender_id,body)
values ('77000000-0000-4000-8000-000000000020','77000000-0000-4000-8000-000000000004','77000000-0000-4000-8000-000000000001','Private fixture');
update private.chat_push_jobs set available_at=now() where message_id='77000000-0000-4000-8000-000000000020';
create temp table claimed_push as select * from public.backend_claim_chat_push_jobs() where conversation_id='77000000-0000-4000-8000-000000000004';
select pg_temp.assert((select count(*)=1 and min(token)='ExpoPushToken[TestReceiver]' from claimed_push),'only opted-in recipient gets a job');
select pg_temp.assert(not exists(select from public.backend_claim_chat_push_jobs() where conversation_id='77000000-0000-4000-8000-000000000004'),'lease prevents immediate redelivery');
select pg_temp.assert(not public.backend_finish_chat_push_job((select id from claimed_push),gen_random_uuid(),'delivered'),'stale worker cannot finish');
select pg_temp.assert(public.backend_finish_chat_push_job((select id from claimed_push),(select lease from claimed_push),'accepted','test-ticket'),'accept ticket');
update private.chat_push_jobs set available_at=now() where message_id='77000000-0000-4000-8000-000000000020';
create temp table claimed_receipt as select * from public.backend_claim_chat_push_jobs() where conversation_id='77000000-0000-4000-8000-000000000004';
select pg_temp.assert((select ticket='test-ticket' from claimed_receipt),'receipt polling does not send a second alert');
select pg_temp.assert(public.backend_finish_chat_push_job((select id from claimed_receipt),(select lease from claimed_receipt),'unregistered'),'dead device is removed');
select pg_temp.assert(not exists(select from private.chat_push_devices where token='ExpoPushToken[TestReceiver]'),'invalid token no longer registered');

select public.backend_manage_chat_push_device('77000000-0000-4000-8000-000000000002','77000000-0000-4000-8000-000000000012','ExpoPushToken[TestReceiver]');
insert into public.messages(id,conversation_id,sender_id,body)
values ('77000000-0000-4000-8000-000000000021','77000000-0000-4000-8000-000000000004','77000000-0000-4000-8000-000000000001','Read fixture');
update public.conversation_participants set last_read_at=now()
 where conversation_id='77000000-0000-4000-8000-000000000004' and user_id='77000000-0000-4000-8000-000000000002';
update private.chat_push_jobs set available_at=now() where message_id='77000000-0000-4000-8000-000000000021';
select pg_temp.assert(not exists(select from public.backend_claim_chat_push_jobs() where conversation_id='77000000-0000-4000-8000-000000000004'),'read messages are suppressed');

update public.conversation_participants set last_read_at=now()-interval '1 hour'
 where conversation_id='77000000-0000-4000-8000-000000000004' and user_id='77000000-0000-4000-8000-000000000002';
insert into public.messages(id,conversation_id,sender_id,body)
values ('77000000-0000-4000-8000-000000000022','77000000-0000-4000-8000-000000000004','77000000-0000-4000-8000-000000000001','Blocked fixture');
insert into public.user_blocks(blocker_id,blocked_id) values('77000000-0000-4000-8000-000000000002','77000000-0000-4000-8000-000000000001');
update private.chat_push_jobs set available_at=now() where message_id='77000000-0000-4000-8000-000000000022';
select pg_temp.assert(not exists(select from public.backend_claim_chat_push_jobs() where conversation_id='77000000-0000-4000-8000-000000000004'),'a block before delivery suppresses the push');
delete from public.user_blocks where blocker_id='77000000-0000-4000-8000-000000000002' and blocked_id='77000000-0000-4000-8000-000000000001';

insert into public.messages(id,conversation_id,sender_id,body)
values ('77000000-0000-4000-8000-000000000023','77000000-0000-4000-8000-000000000004','77000000-0000-4000-8000-000000000001','Prior account fixture');
select pg_temp.assert(public.backend_manage_chat_push_device('77000000-0000-4000-8000-000000000003','77000000-0000-4000-8000-000000000012','ExpoPushToken[TestReceiver]'),'same installation can switch accounts');
update private.chat_push_jobs set available_at=now() where message_id='77000000-0000-4000-8000-000000000023';
select pg_temp.assert(not exists(select from public.backend_claim_chat_push_jobs() where conversation_id='77000000-0000-4000-8000-000000000004'),'old account alerts are suppressed after switching');
select pg_temp.assert(public.backend_manage_chat_push_device('77000000-0000-4000-8000-000000000003','77000000-0000-4000-8000-000000000012'),'current owner can revoke');
select pg_temp.assert(not exists(select from private.chat_push_devices where token='ExpoPushToken[TestReceiver]'),'revocation removes the registration');

rollback;
select 'Private Android chat push registration, delivery and authorization assertions passed' as result;
