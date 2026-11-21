create table private.chat_push_devices (
 installation_id uuid primary key,
 owner_id uuid not null references public.profiles on delete cascade,
 token text not null unique check (length(token) <= 200 and token ~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$'),
 generation uuid not null default gen_random_uuid(),
 refreshed_at timestamptz not null default now()
);
create index chat_push_devices_owner_idx on private.chat_push_devices(owner_id);
create index chat_push_devices_expiry_idx on private.chat_push_devices(refreshed_at);

create table private.chat_push_jobs (
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null references public.messages on delete cascade,
 installation_id uuid not null references private.chat_push_devices on delete cascade,
 device_generation uuid not null,
 recipient_id uuid not null references public.profiles on delete cascade,
 send_before timestamptz not null,
 available_at timestamptz not null,
 lease uuid,
 attempts integer not null default 0,
 ticket text,
 unique(message_id,installation_id)
);
create index chat_push_jobs_due_idx on private.chat_push_jobs(available_at,id);
create index chat_push_jobs_installation_idx on private.chat_push_jobs(installation_id);
create index chat_push_jobs_recipient_idx on private.chat_push_jobs(recipient_id);
alter table private.chat_push_devices enable row level security;
alter table private.chat_push_jobs enable row level security;
revoke all on private.chat_push_devices, private.chat_push_jobs from public, anon, authenticated, service_role;

create function private.manage_chat_push_device(p_actor uuid,p_installation uuid,p_token text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_actor is null or p_installation is null then return false; end if;
 if p_token is null then
  delete from private.chat_push_devices where installation_id=p_installation and owner_id=p_actor;
  return true;
 end if;
 if not private.profile_available(p_actor)
    or not exists(select 1 from public.profiles where id=p_actor and onboarding_completed)
    or length(p_token)>200 or p_token !~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$' then
  return false;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('chat-push:'||p_actor::text,0));
 delete from private.chat_push_devices where owner_id=p_actor and refreshed_at < now()-interval '30 days';
 if (select count(*) from private.chat_push_devices where owner_id=p_actor and installation_id<>p_installation)>=8 then
  return false;
 end if;
 -- An Expo token alone cannot take ownership of another installation.
 insert into private.chat_push_devices as d(installation_id,owner_id,token)
 values(p_installation,p_actor,p_token)
 on conflict(installation_id) do update set owner_id=excluded.owner_id,token=excluded.token,
  generation=case when (d.owner_id,d.token) is distinct from (excluded.owner_id,excluded.token)
                 then gen_random_uuid() else d.generation end,refreshed_at=now();
 return true;
exception when unique_violation then
 return false;
end $$;

create function private.enqueue_chat_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into private.chat_push_jobs(message_id,installation_id,device_generation,recipient_id,send_before,available_at)
 select new.id,d.installation_id,d.generation,p.user_id,now()+interval '10 minutes',now()+interval '5 seconds'
 from public.conversation_participants p
 join private.chat_push_devices d on d.owner_id=p.user_id
 where p.conversation_id=new.conversation_id and p.user_id<>new.sender_id
   and d.refreshed_at>=now()-interval '30 days'
 on conflict(message_id,installation_id) do nothing;
 return new;
end $$;
create trigger messages_enqueue_chat_push after insert on public.messages
for each row execute function private.enqueue_chat_push();

create function private.claim_chat_push_jobs()
returns table(id uuid,lease uuid,token text,recipient_id uuid,conversation_id uuid,ticket text,send_before timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 delete from private.chat_push_devices d where d.installation_id in (
  select stale.installation_id from private.chat_push_devices stale
  where stale.refreshed_at<now()-interval '30 days' limit 200
  for update skip locked
 );
 -- Drop obsolete sends. Accepted tickets can still be checked for provider errors.
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
  )
  order by j.available_at,j.id limit 500 for update of j skip locked
 );
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
 select j.id,j.lease,d.token,j.recipient_id,m.conversation_id,j.ticket,j.send_before
 from claimed j
 join private.chat_push_devices d on d.installation_id=j.installation_id
 join public.messages m on m.id=j.message_id;
end $$;

create function private.finish_chat_push_job(p_id uuid,p_lease uuid,p_result text,p_ticket text)
returns boolean language plpgsql security definer set search_path='' as $$
declare job private.chat_push_jobs%rowtype;
begin
 if p_result='unregistered' then
  -- Keep the device-before-job lock order used by device revocation.
  perform 1 from private.chat_push_devices d
   join private.chat_push_jobs j on j.installation_id=d.installation_id and j.device_generation=d.generation
   where j.id=p_id and j.lease=p_lease for update of d;
 end if;
 select * into job from private.chat_push_jobs where id=p_id and lease=p_lease for update;
 if not found then return false; end if;
 case p_result
 when 'unregistered' then
  delete from private.chat_push_devices
   where installation_id=job.installation_id and generation=job.device_generation;
  delete from private.chat_push_jobs where id=p_id;
 when 'accepted' then
  if p_ticket is null or length(p_ticket) not between 1 and 128 then return false; end if;
  update private.chat_push_jobs set ticket=p_ticket,attempts=0,lease=null,available_at=now()+interval '15 minutes'
   where id=p_id;
 when 'retry' then
  if job.attempts>=4 then
   delete from private.chat_push_jobs where id=p_id;
  else
   update private.chat_push_jobs set lease=null,attempts=attempts+1,
    available_at=now()+make_interval(secs=>case when job.ticket is null then 30 else 120 end * (1 << attempts))
    where id=p_id;
  end if;
 when 'delivered','rejected' then
  delete from private.chat_push_jobs where id=p_id;
 else
  return false;
 end case;
 return true;
end $$;

create function public.backend_manage_chat_push_device(p_actor uuid,p_installation uuid,p_token text default null)
returns boolean language sql security invoker set search_path='' as $$
 select private.manage_chat_push_device(p_actor,p_installation,p_token);
$$;
create function public.backend_claim_chat_push_jobs()
returns table(id uuid,lease uuid,token text,recipient_id uuid,conversation_id uuid,ticket text,send_before timestamptz)
language sql security invoker set search_path='' as $$
 select * from private.claim_chat_push_jobs();
$$;
create function public.backend_finish_chat_push_job(p_id uuid,p_lease uuid,p_result text,p_ticket text default null)
returns boolean language sql security invoker set search_path='' as $$
 select private.finish_chat_push_job(p_id,p_lease,p_result,p_ticket);
$$;

revoke all on function private.enqueue_chat_push(), private.manage_chat_push_device(uuid,uuid,text),
 private.claim_chat_push_jobs(), private.finish_chat_push_job(uuid,uuid,text,text),
 public.backend_manage_chat_push_device(uuid,uuid,text), public.backend_claim_chat_push_jobs(),
 public.backend_finish_chat_push_job(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.manage_chat_push_device(uuid,uuid,text), private.claim_chat_push_jobs(),
 private.finish_chat_push_job(uuid,uuid,text,text), public.backend_manage_chat_push_device(uuid,uuid,text),
 public.backend_claim_chat_push_jobs(), public.backend_finish_chat_push_job(uuid,uuid,text,text) to service_role;

create function private.invoke_chat_push_dispatch() returns bigint
language plpgsql security definer set search_path='' as $$
declare backend_issuer text; jwt text; secret text;
begin
 if not exists(select 1 from private.chat_push_jobs where available_at<=now())
    and not exists(select 1 from private.chat_push_devices where refreshed_at<now()-interval '30 days')
    then return null; end if;
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
revoke all on function private.invoke_chat_push_dispatch() from public,anon,authenticated,service_role;
select cron.schedule('arcenray-chat-push','10 seconds','select private.invoke_chat_push_dispatch()');
