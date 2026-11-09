begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end; $$;
insert into auth.users(id,email) values('76000000-0000-4000-8000-000000000001','chat-a-'||gen_random_uuid()||'@example.invalid'),('76000000-0000-4000-8000-000000000002','chat-b-'||gen_random_uuid()||'@example.invalid'),('76000000-0000-4000-8000-000000000003','chat-c-'||gen_random_uuid()||'@example.invalid');
insert into public.conversations(id,user_low,user_high) values('76000000-0000-4000-8000-000000000004','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002');
insert into public.conversation_participants(conversation_id,user_id) values('76000000-0000-4000-8000-000000000004','76000000-0000-4000-8000-000000000001'),('76000000-0000-4000-8000-000000000004','76000000-0000-4000-8000-000000000002') on conflict do nothing;
select set_config('chat.test.asset',(private.backend_chat_attachment('76000000-0000-4000-8000-000000000001','create','{"conversation_id":"76000000-0000-4000-8000-000000000004","name":"picture.webp","content_type":"image/webp","bytes":100}')->>'id'),true);
do $$ begin
 begin perform private.backend_chat_attachment('76000000-0000-4000-8000-000000000003','download',jsonb_build_object('asset_id',current_setting('chat.test.asset'))); raise exception 'FAIL: nonmember read'; exception when insufficient_privilege then null; end;
 begin perform private.backend_chat_attachment('76000000-0000-4000-8000-000000000002','complete',jsonb_build_object('asset_id',current_setting('chat.test.asset'))); raise exception 'FAIL: nonowner completion'; exception when insufficient_privilege then null; end;
end $$;
select set_config('chat.test.key',(private.backend_chat_attachment('76000000-0000-4000-8000-000000000001','prepare',jsonb_build_object('asset_id',current_setting('chat.test.asset')))->>'attempt_key'),true);
select private.backend_chat_attachment('76000000-0000-4000-8000-000000000001','complete',jsonb_build_object('asset_id',current_setting('chat.test.asset'),'ready_key',current_setting('chat.test.key')));
select set_config('request.jwt.claims','{"sub":"76000000-0000-4000-8000-000000000001","iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1"}',true);
set local role authenticated;
do $$ begin
 begin perform public.backend_chat_attachment('76000000-0000-4000-8000-000000000001','complete','{}'); raise exception 'FAIL: client bypassed verification'; exception when insufficient_privilege then null; end;
end $$;
insert into public.messages(conversation_id,sender_id,body,attachment_id,client_id) values('76000000-0000-4000-8000-000000000004','76000000-0000-4000-8000-000000000001','Hello 🎬',current_setting('chat.test.asset')::uuid,'76000000-0000-4000-8000-000000000005');
reset role;
select pg_temp.assert(private.backend_chat_attachment('76000000-0000-4000-8000-000000000002','download',jsonb_build_object('asset_id',current_setting('chat.test.asset')))->>'ready_key'=current_setting('chat.test.key'),'recipient can access only verified attached object');
select set_config('request.jwt.claims','{"sub":"76000000-0000-4000-8000-000000000003","iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1"}',true);
set local role authenticated;
select pg_temp.assert(not exists(select 1 from public.messages where conversation_id='76000000-0000-4000-8000-000000000004'),'outsider cannot read messages or attachment IDs');
reset role;
insert into public.user_blocks(blocker_id,blocked_id) values('76000000-0000-4000-8000-000000000002','76000000-0000-4000-8000-000000000001');
do $$ begin
 begin perform private.backend_chat_attachment('76000000-0000-4000-8000-000000000002','download',jsonb_build_object('asset_id',current_setting('chat.test.asset'))); raise exception 'FAIL: blocked participant read'; exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'Private chat attachments, verification, membership and block assertions passed' as result;
