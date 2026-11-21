-- Chat delivery immediacy, rich alerts and a consistent overview read.
--
-- Applied to production 2026-11-21 (ledger 20261121191000). The MCP transport
-- used for the apply corrupts dense single statements over ~2 KB, so the claim
-- body is split into private.prune_chat_push_jobs() + the claim query, and the
-- preview logic uses POSIX [[:space:]] and a LIKE voice-note match instead of
-- backslash escapes. Both functions below match production byte-for-byte in
-- semantics; this file is the readable, CLI-safe record.
--
-- Rollback:
--   drop trigger if exists messages_notify_chat_push on public.messages;
--   drop function if exists private.notify_chat_push_dispatch();
--   drop function if exists private.post_chat_push_dispatch();
--   drop function if exists public.get_chat_overview();
--   drop function if exists public.backend_claim_chat_push_jobs();
--   drop function if exists private.claim_chat_push_jobs();
--   drop function if exists private.prune_chat_push_jobs();
--   create or replace function private.enqueue_chat_push() ... (previous body with
--     available_at = now()+interval '5 seconds');
--   create or replace function private.claim_chat_push_jobs() ... (previous column list);
--   create or replace function private.invoke_chat_push_dispatch() ... (previous body);
--   select cron.unschedule('arcenray-chat-push');
--   select cron.schedule('arcenray-chat-push','10 seconds','select private.invoke_chat_push_dispatch()');

-- 1. Shared dispatch poster (vault credentials, same contract as the cron path).
create function private.post_chat_push_dispatch() returns bigint
language plpgsql security definer set search_path='' as $$
declare backend_issuer text; jwt text; secret text;
begin
 select min(issuer) into backend_issuer from private.identity_providers
  where provider='supabase' and enabled having count(*)=1;
 select min(decrypted_secret) into jwt from vault.decrypted_secrets
  where name='arcenray_cleanup_service_role' having count(*)=1;
 select min(decrypted_secret) into secret from vault.decrypted_secrets
  where name='arcenray_cleanup_secret' having count(*)=1;
 if backend_issuer is null or backend_issuer !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/auth/v1$'
    or coalesce(jwt,'')='' or coalesce(secret,'')='' then return null; end if;
 return net.http_post(url:=regexp_replace(backend_issuer,'/auth/v1$','')||'/functions/v1/chat-push-dispatch',
  headers:=jsonb_build_object('Authorization','Bearer '||jwt,'x-cleanup-secret',secret,'Content-Type','application/json'),
  body:='{}'::jsonb,timeout_milliseconds:=30000);
end $$;

-- 2. Jobs become due the moment the message commits. The claim query still
--    suppresses anything the recipient already read, plus blocks and stale
--    registrations, so immediacy never weakens those guarantees.
create or replace function private.enqueue_chat_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into private.chat_push_jobs(message_id,installation_id,device_generation,recipient_id,send_before,available_at)
 select new.id,d.installation_id,d.generation,p.user_id,now()+interval '10 minutes',now()
 from public.conversation_participants p
 join private.chat_push_devices d on d.owner_id=p.user_id
 where p.conversation_id=new.conversation_id and p.user_id<>new.sender_id
   and d.refreshed_at>=now()-interval '30 days'
 on conflict(message_id,installation_id) do nothing;
 return new;
end $$;

-- 3. Immediate dispatch. Runs after enqueue_chat_push (alphabetical trigger order
--    for the same event) and posts asynchronously through pg_net, so the message
--    transaction never waits on the network. The cron remains as the retry and
--    receipt-check sweeper.
create function private.notify_chat_push_dispatch() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.chat_push_jobs where available_at<=now()) then
  perform private.post_chat_push_dispatch();
 end if;
 return null;
end $$;
create trigger messages_notify_chat_push after insert on public.messages
 for each row execute function private.notify_chat_push_dispatch();

-- 4. Sweeper cadence: retries and Expo receipt checks, not first delivery.
do $$
begin
 begin
  perform cron.unschedule('arcenray-chat-push');
 exception when others then null;
 end;
 perform cron.schedule('arcenray-chat-push','30 seconds','select private.invoke_chat_push_dispatch()');
end $$;

-- 5. Rich alert copy, split for statement size. Claimed jobs carry the sender
--    display name, a short preview and the message id, so devices can show
--    "Name — message". The result shape changes, so the wrapper pair is dropped
--    and recreated.
drop function if exists public.backend_claim_chat_push_jobs();
drop function if exists private.claim_chat_push_jobs();
create function private.prune_chat_push_jobs() returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from private.chat_push_devices d where d.installation_id in (
  select stale.installation_id from private.chat_push_devices stale
  where stale.refreshed_at<now()-interval '30 days' limit 200
  for update skip locked
 );
 delete from private.chat_push_jobs old where old.id in (
  select j.id from private.chat_push_jobs j
  join private.chat_push_devices d on d.installation_id=j.installation_id
  join public.messages m on m.id=j.message_id
  where j.available_at<=now() and (
   d.owner_id<>j.recipient_id or d.generation<>j.device_generation
   or (j.ticket is not null and j.send_before<now()-interval '24 hours')
   or (j.ticket is null and (
    j.send_before<=now()
    or not private.profile_available(j.recipient_id) or not private.profile_available(m.sender_id)
    or not exists (select 1 from public.conversation_participants p
                   where p.conversation_id=m.conversation_id and p.user_id=j.recipient_id and p.last_read_at<m.created_at)
    or exists (select 1 from public.user_blocks b
               where (b.blocker_id,b.blocked_id) in ((j.recipient_id,m.sender_id),(m.sender_id,j.recipient_id)))
  ))
  order by j.available_at,j.id limit 500 for update of j skip locked
 );
end $$;
create function private.claim_chat_push_jobs()
returns table(id uuid,lease uuid,token text,recipient_id uuid,conversation_id uuid,ticket text,send_before timestamptz,
 sender_name text,preview text,message_id uuid)
language plpgsql security definer set search_path='' as $$
begin
 perform private.prune_chat_push_jobs();
 return query
 with candidates as (
  select j.id from private.chat_push_jobs j
  join private.chat_push_devices d on d.installation_id=j.installation_id
  join public.messages m on m.id=j.message_id
  where j.available_at<=now() and d.owner_id=j.recipient_id
    and d.generation=j.device_generation and d.refreshed_at>=now()-interval '30 days'
    and ((j.ticket is not null and j.send_before>=now()-interval '24 hours') or (j.ticket is null and (
     j.send_before>now() and private.profile_available(j.recipient_id) and private.profile_available(m.sender_id)
     and exists (select 1 from public.conversation_participants p
                 where p.conversation_id=m.conversation_id and p.user_id=j.recipient_id and p.last_read_at<m.created_at)
     and not exists (select 1 from public.user_blocks b
                     where (b.blocker_id,b.blocked_id) in ((j.recipient_id,m.sender_id),(m.sender_id,j.recipient_id)))
    )))
  order by j.available_at,j.id limit 50 for update of j skip locked
 ), claimed as (
  update private.chat_push_jobs j
  set lease=gen_random_uuid(),available_at=now()+interval '2 minutes'
  from candidates c where c.id=j.id returning j.*
 )
 select j.id,j.lease,d.token,j.recipient_id,m.conversation_id,j.ticket,j.send_before,
  coalesce(nullif(s.full_name,''),'@'||s.handle),
  case
   when m.attachment_id is not null and m.body like 'Voice note%.m4a'
    then 'Sent a voice note'
   when m.attachment_id is not null then 'Sent an attachment'
   else left(regexp_replace(m.body,E'[[:space:]]+',' ','g'),140)
  end,
  j.message_id
 from claimed j
 join private.chat_push_devices d on d.installation_id=j.installation_id
 join public.messages m on m.id=j.message_id
 join public.profiles s on s.id=m.sender_id;
end $$;

-- 5b. Cron invoker reuses the shared poster (idle short-circuit kept).
create or replace function private.invoke_chat_push_dispatch() returns bigint
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.chat_push_jobs where available_at<=now())
    and not exists(select 1 from private.chat_push_devices where refreshed_at<now()-interval '30 days')
    then return null; end if;
 return private.post_chat_push_dispatch();
end $$;

-- 5c. Service wrapper column list must match the enriched claim.
create function public.backend_claim_chat_push_jobs()
returns table(id uuid,lease uuid,token text,recipient_id uuid,conversation_id uuid,ticket text,send_before timestamptz,
 sender_name text,preview text,message_id uuid)
language sql security invoker set search_path='' as $$
 select * from private.claim_chat_push_jobs();
$$;
revoke all on function public.backend_claim_chat_push_jobs() from public,anon,authenticated;
grant execute on function public.backend_claim_chat_push_jobs() to service_role;

-- 6. Single consistent overview read: receipt and newest message arrive from one
--    snapshot, so unread badges can never disagree with the preview line. The
--    peer receipt powers delivery ticks on the conversation's own last message.
create function public.get_chat_overview()
returns table(conversation_id uuid,last_read_at timestamptz,
 last_message_id uuid,last_message_client_id uuid,last_message_sender_id uuid,
 last_message_body text,last_message_attachment_id uuid,last_message_created_at timestamptz,
 peer_last_read_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select p.conversation_id,p.last_read_at,m.id,m.client_id,m.sender_id,m.body,m.attachment_id,m.created_at,
  peer.last_read_at
 from public.conversation_participants p
 left join lateral (
  select id,client_id,sender_id,body,attachment_id,created_at from public.messages
  where conversation_id=p.conversation_id
  order by created_at desc,id desc limit 1
 ) m on true
 left join lateral (
  select cp.last_read_at from public.conversation_participants cp
  where cp.conversation_id=p.conversation_id and cp.user_id<>p.user_id
  limit 1
 ) peer on true
 where p.user_id=private.current_profile_id()
 order by m.created_at desc nulls last,m.id desc nulls last;
$$;
revoke all on function public.get_chat_overview() from public,anon,authenticated,service_role;
grant execute on function public.get_chat_overview() to authenticated,service_role;

revoke all on function private.post_chat_push_dispatch(), private.notify_chat_push_dispatch()
 from public,anon,authenticated,service_role;
-- The public wrapper is security invoker, so the service role also needs the
-- private claim path itself (matches the original chat push grant pattern).
grant execute on function private.prune_chat_push_jobs(), private.claim_chat_push_jobs() to service_role;
