-- CopyObject can change a multipart ETag. Retain original source identity separately
-- from the trusted HEAD snapshots of published and quarantined copies.
alter table private.media_assets add column public_etag text;
alter table private.media_assets add column quarantine_etag text;
alter table private.media_jobs add column source_etag text;
alter table private.media_jobs add column backup_etag text;
update private.media_jobs j set source_etag=a.etag from private.media_assets a where a.id=j.asset_id;

create function private.backend_finish_promotion(p_id uuid,p_owner uuid,p_token uuid,p_public_etag text,p_bytes bigint,p_content_type text) returns jsonb
language plpgsql security definer set search_path='' as $$
 declare a private.media_assets;
 begin
 if p_public_etag is null or length(p_public_etag)>256 or p_public_etag !~ '^("[a-fA-F0-9-]+"|[a-fA-F0-9-]+)$' then raise exception 'Invalid destination snapshot' using errcode='22023'; end if;
 perform 1 from private.user_state where user_id=p_owner for update;
 if not found or not private.profile_available(p_owner) then raise exception 'Owner unavailable' using errcode='42501'; end if;
 select * into a from private.media_assets where id=p_id and owner_id=p_owner for update;
 if not found or a.status<>'uploaded' or a.promotion_token is distinct from p_token or p_token is null or a.promotion_until is null or a.promotion_until<=now() then
 raise exception 'Promotion changed; cleanup will reconcile' using errcode='55000'; end if;
 if p_bytes is distinct from a.actual_bytes or p_content_type is distinct from a.content_type or p_bytes<1 then raise exception 'Destination does not match verified media' using errcode='22023'; end if;
 update private.media_assets set status='ready',public_key='assets/'||id::text,public_etag=p_public_etag,promotion_token=null,promotion_until=null where id=p_id returning * into a;
 if a.kind='profile_picture' then update public.profiles set profile_pic_key=a.public_key where id=p_owner; end if;
 return to_jsonb(a);
 end; $$;
create function public.backend_finish_promotion(p_id uuid,p_owner uuid,p_token uuid,p_public_etag text,p_bytes bigint,p_content_type text) returns jsonb
language sql set search_path='' as $$ select private.backend_finish_promotion(p_id,p_owner,p_token,p_public_etag,p_bytes,p_content_type); $$;
-- Retain the old signature so stale callers fail closed, rather than claiming a
-- public copy has the source ETag without a destination HEAD observation.
create or replace function public.backend_finish_promotion(p_id uuid,p_owner uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin raise exception 'Destination HEAD snapshot required' using errcode='55000'; end; $$;

-- Preserve writer/signature grace and multipart cleanup behavior while snapshotting
-- the exact appropriate ETags on every version/action transition.
do $$ declare definition text; begin
 select pg_get_functiondef('private.enqueue_media(uuid,text)'::regprocedure) into definition;
 if position('available_at,multipart)' in definition)=0 or position('multipart=excluded.multipart' in definition)=0 then raise exception 'Expected multipart enqueue definition missing'; end if;
 definition:=replace(definition,'available_at,multipart)','available_at,multipart,source_etag,backup_etag)');
 definition:=replace(definition,'coalesce(a.actual_bytes,a.expected_bytes),a.etag,p_action','coalesce(a.actual_bytes,a.expected_bytes),coalesce(a.public_etag,a.etag),p_action');
 definition:=replace(definition,'now())),multi)','now())),multi,a.etag,a.quarantine_etag)');
 definition:=replace(definition,'multipart=excluded.multipart','multipart=excluded.multipart,etag=excluded.etag,source_etag=excluded.source_etag,backup_etag=excluded.backup_etag');
 execute definition;
end $$;

-- Only a live leased worker may record its conditional-copy + HEAD result. This
-- must commit before public withdrawal or backup deletion; version/CAS rejects stale IO.
create function private.backend_record_media_copy(p_asset uuid,p_version bigint,p_area text,p_etag text,p_bytes bigint,p_content_type text) returns boolean
language plpgsql security definer set search_path='' as $$
 declare a private.media_assets; j private.media_jobs; owner uuid;
 begin
 if p_area is null or p_area not in ('private','public') or p_etag is null or length(p_etag)>256 or p_etag !~ '^("[a-fA-F0-9-]+"|[a-fA-F0-9-]+)$' then raise exception 'Invalid media snapshot' using errcode='22023'; end if;
 select owner_id into owner from private.media_assets where id=p_asset;
 if owner is null then return false; end if;
 perform 1 from private.user_state where user_id=owner for update;
 select * into a from private.media_assets where id=p_asset for update;
 select * into j from private.media_jobs where asset_id=p_asset and version=p_version and state='processing' and lease_until>now() for update;
 if not found or j.owner_id<>a.owner_id or (p_area='private' and (j.action<>'quarantine' or a.status<>'quarantining'))
 or (p_area='public' and (j.action<>'restore' or a.status<>'restoring')) then return false; end if;
 if p_bytes is distinct from j.bytes or p_content_type is distinct from j.content_type then raise exception 'Copy snapshot does not match media' using errcode='22023'; end if;
 if p_area='private' then
 update private.media_assets set quarantine_etag=p_etag where id=p_asset;
 update private.media_jobs set backup_etag=p_etag where asset_id=p_asset;
 else
 update private.media_assets set public_etag=p_etag where id=p_asset;
 update private.media_jobs set etag=p_etag where asset_id=p_asset;
 end if;
 return true;
 end; $$;
create function public.backend_record_media_copy(p_asset uuid,p_version bigint,p_area text,p_etag text,p_bytes bigint,p_content_type text) returns boolean
language sql set search_path='' as $$ select private.backend_record_media_copy(p_asset,p_version,p_area,p_etag,p_bytes,p_content_type); $$;

create function private.source_cleanup_safe(p_asset uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select a.expires_at+interval '15 minutes'<=now() or exists(select 1 from private.multipart_uploads m
 where m.asset_id=a.id and m.status='completed' and m.upload_id is not null and m.op_token is null)
 from private.media_assets a where a.id=p_asset; $$;
create or replace function public.backend_duplicate_sources() returns setof private.media_assets
language sql stable security definer set search_path='' as $$
 select a.* from private.media_assets a where a.status='ready' and not a.source_deleted and private.source_cleanup_safe(a.id)
 order by a.created_at limit 100; $$;
create or replace function public.backend_source_deleted(p_id uuid) returns void
language sql security definer set search_path='' as $$
 update private.media_assets set source_deleted=true where id=p_id and status='ready' and private.source_cleanup_safe(p_id); $$;
-- Catch previously recorded ordinary-PUT cleanup within its still-replayable window.
update private.media_assets a set source_deleted=false where a.status='ready' and a.source_deleted and not private.source_cleanup_safe(a.id);

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('private','public') and p.proname in ('backend_finish_promotion','backend_record_media_copy','source_cleanup_safe','backend_duplicate_sources','backend_source_deleted') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
