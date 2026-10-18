-- Browser-to-R2 native film parts. Provider IDs and keys remain service-only.
create table private.multipart_uploads (
 asset_id uuid primary key references private.media_assets(id) on delete cascade,
 owner_id uuid not null references public.profiles(id) on delete cascade,
 draft_id uuid references public.films(id) on delete set null,
 request_id uuid not null,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 upload_id text check(length(upload_id) between 1 and 2048),
 status text not null default 'initializing' check(status in ('initializing','uploading','completing','completed','aborting','aborted')),
 resume_expires_at timestamptz not null default now()+interval '24 hours',
 op_token uuid, op_until timestamptz,
 last_signature_expires_at timestamptz,
 created_at timestamptz not null default now(),
 unique(owner_id,request_id), check((op_token is null)=(op_until is null))
);
create index multipart_uploads_draft_idx on private.multipart_uploads(draft_id);
alter table private.multipart_uploads enable row level security;
revoke all on private.multipart_uploads from public,anon,authenticated;
grant all on private.multipart_uploads to service_role;
create policy backend_only on private.multipart_uploads to service_role using(true) with check(true);
alter table private.media_jobs add column multipart boolean not null default false;

create function private.multipart_snapshot(p_owner uuid,p_asset uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('asset_id',a.id,'owner_id',m.owner_id,'draft_id',m.draft_id,
 'object_key',a.object_key,'bytes',a.expected_bytes,'fingerprint',m.fingerprint,'upload_id',m.upload_id,
 'status',m.status,'resume_expires_at',m.resume_expires_at,'op_token',m.op_token,'op_until',m.op_until,
 'last_signature_expires_at',m.last_signature_expires_at,
 'part_size',16777216,'part_count',((a.expected_bytes+16777215)/16777216)::integer,
 'asset_status',a.status,'public_key',a.public_key)
 from private.multipart_uploads m join private.media_assets a on a.id=m.asset_id
 where m.asset_id=p_asset and m.owner_id=p_owner and a.owner_id=p_owner; $$;

create function private.backend_create_multipart(p_owner uuid,p_draft uuid,p_request uuid,p_bytes bigint,p_fingerprint text) returns jsonb
language plpgsql security definer set search_path='' as $$
 declare lim bigint; used bigint; m private.multipart_uploads; a private.media_assets;
 begin
 if p_owner is null or p_draft is null or p_request is null or p_bytes is null or p_bytes<1 or p_bytes>2147483648
 or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Invalid multipart reservation' using errcode='22023'; end if;
 select quota_bytes into lim from private.user_state where user_id=p_owner for update;
 if lim is null or not private.profile_available(p_owner) then raise exception 'Owner unavailable' using errcode='42501'; end if;
 if not exists(select 1 from public.films where id=p_draft and owner_id=p_owner and status='draft')
 or not private.film_available(p_draft) then raise exception 'Owned draft required' using errcode='42501'; end if;
 select * into m from private.multipart_uploads where owner_id=p_owner and request_id=p_request;
 if found then
 select * into a from private.media_assets where id=m.asset_id;
 if m.draft_id is distinct from p_draft or a.expected_bytes<>p_bytes or m.fingerprint<>p_fingerprint then
 raise exception 'Upload request parameters changed' using errcode='22023'; end if;
 return private.multipart_snapshot(p_owner,m.asset_id);
 end if;
 -- Private draft association survives metadata autosave/reload without attaching unverified media.
 select x.* into a from private.multipart_uploads existing join private.media_assets x on x.id=existing.asset_id
 where existing.owner_id=p_owner and existing.draft_id=p_draft and x.status='pending'
 and existing.status in ('initializing','uploading','completing','completed') order by existing.created_at desc limit 1;
 if found then
 select * into m from private.multipart_uploads where asset_id=a.id;
 if a.expected_bytes=p_bytes and m.fingerprint=p_fingerprint then return private.multipart_snapshot(p_owner,a.id); end if;
 raise exception 'Resume or discard the existing draft upload first' using errcode='55000';
 end if;
 select coalesce(sum(coalesce(actual_bytes,expected_bytes)),0) into used from private.media_assets
 where owner_id=p_owner and status in ('pending','uploaded','ready','deleting','quarantining','quarantined','restoring');
 if p_bytes+used>lim then raise exception 'Storage quota exceeded' using errcode='22023'; end if;
 if (select count(*) from private.media_assets where owner_id=p_owner and created_at>now()-interval '1 hour')>=30 then
 raise exception 'Upload rate limit' using errcode='54000'; end if;
 insert into private.media_assets(owner_id,kind,object_key,expected_bytes,content_type,expires_at)
 values(p_owner,'film',p_owner::text||'/'||gen_random_uuid()::text,p_bytes,'video/mp4',now()+interval '24 hours') returning * into a;
 insert into private.multipart_uploads(asset_id,owner_id,draft_id,request_id,fingerprint,resume_expires_at)
 values(a.id,p_owner,p_draft,p_request,p_fingerprint,a.expires_at);
 return private.multipart_snapshot(p_owner,a.id);
 end; $$;

create function private.backend_multipart(p_owner uuid,p_asset uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
 declare result jsonb;
 begin
 result:=private.multipart_snapshot(p_owner,p_asset);
 if result is null then raise exception 'Upload unavailable' using errcode='42501'; end if;
 return result;
 end; $$;
create function private.backend_list_multipart(p_owner uuid,p_draft uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
 begin
 if p_owner is null or not exists(select 1 from public.films where id=p_draft and owner_id=p_owner) then
 raise exception 'Draft unavailable' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(private.multipart_snapshot(p_owner,m.asset_id) order by m.created_at desc)
 from private.multipart_uploads m where m.owner_id=p_owner and m.draft_id=p_draft),'[]'::jsonb);
 end; $$;

create function private.backend_claim_multipart_operation(p_owner uuid,p_asset uuid,p_operation text) returns jsonb
language plpgsql security definer set search_path='' as $$
 declare a private.media_assets; m private.multipart_uploads; token uuid;
 begin
 if p_operation is null or p_operation not in ('initialize','complete') then raise exception 'Invalid multipart operation' using errcode='22023'; end if;
 perform 1 from private.user_state where user_id=p_owner for update;
 if not found or not private.profile_available(p_owner) then raise exception 'Owner unavailable' using errcode='42501'; end if;
 select * into a from private.media_assets where id=p_asset and owner_id=p_owner for update;
 if not found then raise exception 'Upload unavailable' using errcode='42501'; end if;
 select * into m from private.multipart_uploads where asset_id=p_asset and owner_id=p_owner for update;
 if not found or m.status in ('aborting','aborted') then raise exception 'Upload unavailable' using errcode='42501'; end if;
 if (p_operation='initialize' and m.upload_id is not null) or (p_operation='complete' and m.status='completed') then
 return private.multipart_snapshot(p_owner,p_asset); end if;
 if a.status<>'pending' or m.resume_expires_at<=now() or m.draft_id is null
 or not exists(select 1 from public.films where id=m.draft_id and owner_id=p_owner and status='draft')
 or not private.film_available(m.draft_id) then raise exception 'Pending draft upload required' using errcode='42501'; end if;
 if (m.op_until is not null and m.op_until>now()) or (a.promotion_until is not null and a.promotion_until>now()) then
 raise exception 'Upload operation in progress; retry' using errcode='55000'; end if;
 if (p_operation='initialize' and m.status<>'initializing') or (p_operation='complete' and (m.status not in ('uploading','completing') or m.upload_id is null)) then
 raise exception 'Invalid upload transition' using errcode='22023'; end if;
 token:=gen_random_uuid();
 update private.multipart_uploads set op_token=token,op_until=now()+interval '5 minutes',
 status=case when p_operation='complete' then 'completing' else 'initializing' end where asset_id=p_asset;
 update private.media_assets set promotion_token=token,promotion_until=now()+interval '5 minutes' where id=p_asset;
 return private.multipart_snapshot(p_owner,p_asset);
 end; $$;

create function private.backend_initialize_multipart(p_owner uuid,p_asset uuid,p_token uuid,p_upload_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
 declare a private.media_assets; m private.multipart_uploads;
 begin
 if p_upload_id is null or length(p_upload_id) not between 1 and 2048 then raise exception 'Invalid provider upload ID' using errcode='22023'; end if;
 perform 1 from private.user_state where user_id=p_owner for update;
 if not found or not private.profile_available(p_owner) then raise exception 'Owner unavailable' using errcode='42501'; end if;
 select * into a from private.media_assets where id=p_asset and owner_id=p_owner for update;
 if not found then raise exception 'Upload unavailable' using errcode='42501'; end if;
 select * into m from private.multipart_uploads where asset_id=p_asset and owner_id=p_owner for update;
 if not found or m.status<>'initializing' or a.status<>'pending' or m.op_token is distinct from p_token or p_token is null
 or m.op_until is null or m.op_until<=now() or a.promotion_token is distinct from p_token or a.promotion_until is null or a.promotion_until<=now()
 or m.resume_expires_at<=now() or not exists(select 1 from public.films where id=m.draft_id and owner_id=p_owner and status='draft')
 or not private.film_available(m.draft_id) then raise exception 'Upload lease expired or upload changed' using errcode='42501'; end if;
 update private.multipart_uploads set upload_id=p_upload_id,status='uploading',op_token=null,op_until=null where asset_id=p_asset;
 update private.media_assets set promotion_token=null,promotion_until=null where id=p_asset;
 return private.multipart_snapshot(p_owner,p_asset);
 end; $$;

create function private.backend_complete_multipart(p_owner uuid,p_asset uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
 declare a private.media_assets; m private.multipart_uploads;
 begin
 perform 1 from private.user_state where user_id=p_owner for update;
 if not found or not private.profile_available(p_owner) then raise exception 'Owner unavailable' using errcode='42501'; end if;
 select * into a from private.media_assets where id=p_asset and owner_id=p_owner for update;
 if not found then raise exception 'Upload unavailable' using errcode='42501'; end if;
 select * into m from private.multipart_uploads where asset_id=p_asset and owner_id=p_owner for update;
 if not found or m.status<>'completing' or m.upload_id is null or a.status<>'pending'
 or m.op_token is distinct from p_token or p_token is null or m.op_until is null or m.op_until<=now()
 or a.promotion_token is distinct from p_token or a.promotion_until is null or a.promotion_until<=now() or m.resume_expires_at<=now()
 or not exists(select 1 from public.films where id=m.draft_id and owner_id=p_owner and status='draft')
 or not private.film_available(m.draft_id) then raise exception 'Upload lease expired or upload changed' using errcode='42501'; end if;
 -- Assembled bytes are still untrusted pending media; existing verification must follow.
 update private.multipart_uploads set status='completed',op_token=null,op_until=null where asset_id=p_asset;
 update private.media_assets set promotion_token=null,promotion_until=null where id=p_asset;
 return private.multipart_snapshot(p_owner,p_asset);
 end; $$;

-- Trusted Edge precondition: canonical ListParts was received but is incomplete or
-- wrong-sized, and NO CompleteMultipart provider request has started. Ambiguous
-- provider responses keep the writer lease; they must never use this rollback.
create function private.backend_release_multipart_operation(p_owner uuid,p_asset uuid,p_token uuid) returns void
language plpgsql security definer set search_path='' as $$
 declare a private.media_assets; m private.multipart_uploads;
 begin
 perform 1 from private.user_state where user_id=p_owner for update;
 if not found or not private.profile_available(p_owner) then raise exception 'Owner unavailable' using errcode='42501'; end if;
 select * into a from private.media_assets where id=p_asset and owner_id=p_owner for update;
 if not found then raise exception 'Upload unavailable' using errcode='42501'; end if;
 select * into m from private.multipart_uploads where asset_id=p_asset and owner_id=p_owner for update;
 if not found or m.status<>'completing' or m.upload_id is null or a.status<>'pending'
 or p_token is null or m.op_token is distinct from p_token or m.op_until is null or m.op_until<=now()
 or a.promotion_token is distinct from p_token or a.promotion_until is null or a.promotion_until<=now()
 or m.resume_expires_at<=now() or not exists(select 1 from public.films where id=m.draft_id and owner_id=p_owner and status='draft')
 or not private.film_available(m.draft_id) then raise exception 'Upload lease expired or upload changed' using errcode='42501'; end if;
 update private.multipart_uploads set status='uploading',op_token=null,op_until=null where asset_id=p_asset;
 update private.media_assets set promotion_token=null,promotion_until=null where id=p_asset;
 end; $$;

create function private.backend_sign_multipart(p_owner uuid,p_asset uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
 declare a private.media_assets; m private.multipart_uploads;
 begin
 perform 1 from private.user_state where user_id=p_owner for update;
 if not found or not private.profile_available(p_owner) then raise exception 'Owner unavailable' using errcode='42501'; end if;
 select * into a from private.media_assets where id=p_asset and owner_id=p_owner for update;
 if not found then raise exception 'Upload unavailable' using errcode='42501'; end if;
 select * into m from private.multipart_uploads where asset_id=p_asset and owner_id=p_owner for update;
 if not found or m.status<>'uploading' or m.upload_id is null or m.resume_expires_at<=now() or a.status<>'pending'
 or not exists(select 1 from public.films where id=m.draft_id and owner_id=p_owner and status='draft')
 or not private.film_available(m.draft_id) then raise exception 'Upload not signable' using errcode='42501'; end if;
 update private.multipart_uploads set last_signature_expires_at=now()+interval '10 minutes' where asset_id=p_asset;
 return private.multipart_snapshot(p_owner,p_asset);
 end; $$;

create function private.backend_abort_multipart(p_owner uuid,p_asset uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
 declare a private.media_assets; m private.multipart_uploads;
 begin
 perform 1 from private.user_state where user_id=p_owner for update;
 select * into a from private.media_assets where id=p_asset and owner_id=p_owner for update;
 if not found then raise exception 'Upload unavailable' using errcode='42501'; end if;
 select * into m from private.multipart_uploads where asset_id=p_asset and owner_id=p_owner for update;
 if not found then raise exception 'Upload unavailable' using errcode='42501'; end if;
 if m.status in ('aborting','aborted') then return private.multipart_snapshot(p_owner,p_asset); end if;
 if a.status<>'pending' then raise exception 'Verified media requires normal film removal' using errcode='42501'; end if;
 perform private.enqueue_media(p_asset,'delete');
 update private.multipart_uploads set status='aborting',op_token=null,op_until=null where asset_id=p_asset;
 return private.multipart_snapshot(p_owner,p_asset);
 end; $$;

-- Keep existing writer hold and ordinary PUT expiration; snapshot multipart identity
-- on durable jobs so workers can abort exact-key sessions before removing objects.
create or replace function private.enqueue_media(p_asset uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
 declare a private.media_assets; j private.media_jobs; owner uuid; multi boolean;
 begin
 select owner_id into owner from private.media_assets where id=p_asset;
 if owner is null then return; end if;
 perform 1 from private.user_state where user_id=owner for update;
 select * into a from private.media_assets where id=p_asset for update;
 if not found or a.status='rejected' then return; end if;
 select * into j from private.media_jobs where asset_id=p_asset for update;
 if found and j.state='processing' and j.lease_until>now() then raise exception 'Media operation in progress; retry shortly' using errcode='55000'; end if;
 if j.action=p_action and j.state in ('pending','processing') then return; end if;
 multi:=exists(select 1 from private.multipart_uploads where asset_id=p_asset);
 insert into private.media_jobs(asset_id,owner_id,object_key,public_key,content_type,bytes,etag,action,private_delete_after,available_at,multipart)
 values(a.id,a.owner_id,a.object_key,'assets/'||a.id::text,a.content_type,coalesce(a.actual_bytes,a.expected_bytes),a.etag,p_action,
 greatest(now(),a.expires_at+interval '15 minutes'),greatest(now(),coalesce(a.promotion_until+interval '5 minutes',now())),multi)
 on conflict(asset_id) do update set action=excluded.action,version=media_jobs.version+1,state='pending',available_at=excluded.available_at,
 multipart=excluded.multipart,lease_until=null,attempts=0,last_error=null,updated_at=now();
 update private.media_assets set status=case p_action when 'delete' then 'deleting' when 'quarantine' then 'quarantining' else 'restoring' end where id=p_asset;
 if p_action='delete' then update private.multipart_uploads set status='aborting',op_token=null,op_until=null where asset_id=p_asset and a.status='pending'; end if;
 end; $$;

-- Extend the existing attachment guard instead of replacing its ownership/status checks.
do $$ declare definition text; begin
 select pg_get_functiondef('private.guard_media_references()'::regprocedure) into definition;
 if position('return new;' in definition)=0 then raise exception 'Expected media guard missing'; end if;
 definition:=replace(definition,'return new;',
 'if exists(select 1 from private.multipart_uploads m join private.media_assets x on x.id=m.asset_id
 where m.asset_id=new.film_asset_id and x.status=''pending'' and (m.draft_id is distinct from new.id or m.status in (''aborting'',''aborted''))) then
 raise exception ''Pending multipart belongs to another draft or is aborting'' using errcode=''42501''; end if; return new;');
 execute definition;
end $$;
create function private.multipart_source_changed() returns trigger language plpgsql security definer set search_path='' as $$
 declare item record; detached uuid;
 begin
 if tg_op='UPDATE' then detached:=old.film_asset_id; end if;
 perform 1 from private.user_state where user_id=old.owner_id for update;
 for item in select m.asset_id from private.multipart_uploads m join private.media_assets a on a.id=m.asset_id
 where m.draft_id=old.id and m.owner_id=old.owner_id and a.status='pending'
 and (tg_op='DELETE' or m.asset_id=detached) order by m.asset_id loop
 perform private.enqueue_media(item.asset_id,'delete');
 end loop;
 if tg_op='DELETE' then return old; end if;
 return new;
 end; $$;
create trigger films_multipart_detached after update of film_asset_id on public.films for each row
 when(old.film_asset_id is distinct from new.film_asset_id) execute function private.multipart_source_changed();
create trigger films_multipart_deleted before delete on public.films for each row execute function private.multipart_source_changed();
create function private.multipart_asset_rejected() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 update private.multipart_uploads set status='aborted',op_token=null,op_until=null where asset_id=new.id;
 return new;
 end; $$;
create trigger multipart_asset_rejected after update of status on private.media_assets for each row
 when(new.status='rejected' and old.status is distinct from new.status) execute function private.multipart_asset_rejected();

-- Public invoker wrappers; every internal operation remains service-only.
create function public.backend_create_multipart(p_owner uuid,p_draft uuid,p_request uuid,p_bytes bigint,p_fingerprint text) returns jsonb language sql set search_path='' as $$ select private.backend_create_multipart(p_owner,p_draft,p_request,p_bytes,p_fingerprint); $$;
create function public.backend_multipart(p_owner uuid,p_asset uuid) returns jsonb language sql stable set search_path='' as $$ select private.backend_multipart(p_owner,p_asset); $$;
create function public.backend_list_multipart(p_owner uuid,p_draft uuid) returns jsonb language sql stable set search_path='' as $$ select private.backend_list_multipart(p_owner,p_draft); $$;
create function public.backend_claim_multipart_operation(p_owner uuid,p_asset uuid,p_operation text) returns jsonb language sql set search_path='' as $$ select private.backend_claim_multipart_operation(p_owner,p_asset,p_operation); $$;
create function public.backend_initialize_multipart(p_owner uuid,p_asset uuid,p_token uuid,p_upload_id text) returns jsonb language sql set search_path='' as $$ select private.backend_initialize_multipart(p_owner,p_asset,p_token,p_upload_id); $$;
create function public.backend_complete_multipart(p_owner uuid,p_asset uuid,p_token uuid) returns jsonb language sql set search_path='' as $$ select private.backend_complete_multipart(p_owner,p_asset,p_token); $$;
create function public.backend_release_multipart_operation(p_owner uuid,p_asset uuid,p_token uuid) returns void language sql set search_path='' as $$ select private.backend_release_multipart_operation(p_owner,p_asset,p_token); $$;
create function public.backend_sign_multipart(p_owner uuid,p_asset uuid) returns jsonb language sql set search_path='' as $$ select private.backend_sign_multipart(p_owner,p_asset); $$;
create function public.backend_abort_multipart(p_owner uuid,p_asset uuid) returns jsonb language sql set search_path='' as $$ select private.backend_abort_multipart(p_owner,p_asset); $$;
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('private','public') and p.proname in ('multipart_snapshot','backend_create_multipart','backend_multipart','backend_list_multipart','backend_claim_multipart_operation','backend_initialize_multipart','backend_complete_multipart','backend_sign_multipart','backend_abort_multipart','backend_release_multipart_operation','multipart_source_changed','multipart_asset_rejected') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
