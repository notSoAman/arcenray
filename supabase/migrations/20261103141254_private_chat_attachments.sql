-- Private R2 attachments. Only the authenticated Edge Function may reserve,
-- verify or sign an object. Messages remain governed by existing membership RLS.
create table private.chat_attachments (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid references public.profiles on delete set null,
 conversation_id uuid references public.conversations on delete set null,
 name text not null check(length(name) between 1 and 180),
 content_type text not null,
 bytes bigint not null check(bytes between 1 and 20971520),
 ready_key text, object_keys text[] not null default '{}',
 state text not null default 'pending' check(state in ('pending','uploaded','deleting')),
 message_id uuid unique references public.messages on delete set null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '1 day'
);
alter table private.chat_attachments enable row level security;
revoke all on private.chat_attachments from public,anon,authenticated;
grant all on private.chat_attachments to service_role;
create policy backend_only on private.chat_attachments to service_role using(true) with check(true);
create index chat_attachments_owner on private.chat_attachments(owner_id);
create index chat_attachments_conversation on private.chat_attachments(conversation_id);
create index chat_attachments_cleanup on private.chat_attachments(expires_at) where message_id is null;
alter table public.messages add column attachment_id uuid unique references private.chat_attachments on delete set null;
grant insert(attachment_id) on public.messages to authenticated;

create function private.bind_chat_attachment() returns trigger
language plpgsql security definer set search_path='' as $$
declare a private.chat_attachments;
begin
 if new.attachment_id is null then return new; end if;
 select * into a from private.chat_attachments where id=new.attachment_id for update;
 if not found or a.owner_id is distinct from new.sender_id or a.conversation_id is distinct from new.conversation_id
   or a.state<>'uploaded' or a.message_id is not null or a.expires_at<=now() then
   raise exception 'Attachment is not available for this message' using errcode='42501';
 end if;
 update private.chat_attachments set message_id=new.id where id=a.id;
 return new;
end; $$;
create trigger messages_bind_attachment after insert on public.messages for each row execute function private.bind_chat_attachment();

create function private.backend_chat_attachment(p_actor uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.chat_attachments; c uuid; total bigint; attempt text;
begin
 if p_action='cleanup' then
   with victims as (
     select id from private.chat_attachments where state='deleting' or owner_id is null or conversation_id is null
       or (message_id is null and expires_at<now()) order by expires_at limit 8 for update skip locked
   ), marked as (
     update private.chat_attachments set state='deleting' where id in(select id from victims) returning id,object_keys
   ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'object_keys',object_keys)),'[]'::jsonb) into p_data from marked;
   return p_data;
 elsif p_action='removed' then
   delete from private.chat_attachments where id=(p_data->>'asset_id')::uuid and state='deleting';
   return 'true'::jsonb;
 end if;
 if p_actor is null or not private.profile_available(p_actor) then raise exception 'Account unavailable' using errcode='42501'; end if;
 if p_action='create' then
   c:=(p_data->>'conversation_id')::uuid;
 else
   select * into a from private.chat_attachments where id=(p_data->>'asset_id')::uuid for update;
   if not found or a.state='deleting' then raise exception 'Attachment unavailable' using errcode='42501'; end if;
   c:=a.conversation_id;
 end if;
 if not exists(select 1 from public.conversations v where v.id=c and p_actor in(v.user_low,v.user_high)
   and private.profile_available(v.user_low) and private.profile_available(v.user_high)
   and not exists(select 1 from public.user_blocks b where (b.blocker_id=v.user_low and b.blocked_id=v.user_high)
     or (b.blocker_id=v.user_high and b.blocked_id=v.user_low))) then
   raise exception 'Conversation unavailable' using errcode='42501';
 end if;
 if p_action='create' then
   perform 1 from public.profiles where id=p_actor for update;
   select coalesce(sum(bytes),0) into total from private.chat_attachments where owner_id=p_actor;
   if total+(p_data->>'bytes')::bigint>209715200 then raise exception 'Chat attachment storage limit reached'; end if;
   if p_data->>'content_type' not in ('image/jpeg','image/png','image/webp','image/gif','audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-m4a','application/pdf','application/zip','application/octet-stream','text/plain') then
     raise exception 'Unsupported attachment type';
   end if;
   insert into private.chat_attachments(owner_id,conversation_id,name,content_type,bytes)
     values(p_actor,c,p_data->>'name',p_data->>'content_type',(p_data->>'bytes')::bigint) returning * into a;
 elsif p_action in ('upload','prepare','complete') then
   if a.owner_id<>p_actor or a.message_id is not null or a.expires_at<=now() then raise exception 'Attachment unavailable' using errcode='42501'; end if;
   if p_action='prepare' and a.state='pending' then
     if cardinality(a.object_keys)>=5 then raise exception 'Please choose this file again to restart sending'; end if;
     attempt:='chat/'||a.id||'/'||gen_random_uuid();
     update private.chat_attachments set object_keys=array_append(object_keys,attempt) where id=a.id returning * into a;
     return to_jsonb(a)||jsonb_build_object('attempt_key',attempt);
   elsif p_action='complete' and a.state='pending' then
     if not coalesce((p_data->>'ready_key')=any(a.object_keys),false) then raise exception 'Invalid attachment verification'; end if;
     update private.chat_attachments set state='uploaded',ready_key=p_data->>'ready_key' where id=a.id returning * into a;
   end if;
 elsif p_action='download' then
   if a.state<>'uploaded' or (a.message_id is null and a.owner_id<>p_actor) then raise exception 'Attachment unavailable' using errcode='42501'; end if;
 else raise exception 'Invalid attachment operation'; end if;
 return to_jsonb(a);
end; $$;
create function public.backend_chat_attachment(p_actor uuid,p_action text,p_data jsonb) returns jsonb
language sql set search_path='' as $$ select private.backend_chat_attachment(p_actor,p_action,p_data); $$;
revoke all on function private.backend_chat_attachment(uuid,text,jsonb),public.backend_chat_attachment(uuid,text,jsonb),private.bind_chat_attachment() from public,anon,authenticated;
grant execute on function private.backend_chat_attachment(uuid,text,jsonb),public.backend_chat_attachment(uuid,text,jsonb) to service_role;
