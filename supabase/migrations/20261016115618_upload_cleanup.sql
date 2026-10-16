alter table private.media_assets drop constraint media_assets_status_check;
alter table private.media_assets add constraint media_assets_status_check check(status in ('pending','uploaded','ready','deleting','rejected'));
alter table private.media_assets add column source_deleted boolean not null default false;
create or replace function private.get_my_storage() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('quota_bytes',s.quota_bytes,
 'used_bytes',coalesce((select sum(actual_bytes) from private.media_assets where owner_id=auth.uid() and status in ('uploaded','ready')),0),
 'reserved_bytes',coalesce((select sum(coalesce(actual_bytes,expected_bytes)) from private.media_assets where owner_id=auth.uid() and status in ('pending','deleting')),0))
 from private.user_state s where user_id=auth.uid(); $$;
create or replace function private.reserve_upload(p_kind text,p_bytes bigint,p_content_type text) returns jsonb language plpgsql security definer set search_path='' as $$
 declare me uuid:=auth.uid(); lim bigint; used bigint; asset private.media_assets;
 begin
 if me is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select quota_bytes into lim from private.user_state where user_id=me for update;
 if lim is null then raise exception 'Profile missing'; end if;
 select coalesce(sum(coalesce(actual_bytes,expected_bytes)),0) into used from private.media_assets where owner_id=me and status in ('pending','uploaded','ready','deleting');
 if p_bytes<=0 or p_bytes+used>lim then raise exception 'Storage quota exceeded' using errcode='22023'; end if;
 if (p_kind='profile_picture' and p_bytes>102400) or (p_kind='poster' and p_bytes>524288) or (p_kind='hook' and p_bytes>52428800) then raise exception 'Asset too large' using errcode='22023'; end if;
 if (select count(*) from private.media_assets where owner_id=me and created_at>now()-interval '1 hour')>=30 then raise exception 'Upload rate limit' using errcode='54000'; end if;
 insert into private.media_assets(owner_id,kind,object_key,expected_bytes,content_type)
 values(me,p_kind,me::text||'/'||gen_random_uuid()::text,p_bytes,p_content_type) returning * into asset;
 return to_jsonb(asset);
 end; $$;
-- Claim before deletion. In-flight promotion cannot change deleting back to ready.
create function public.backend_claim_expired_assets() returns setof private.media_assets language plpgsql security definer set search_path='' as $$
 begin
 return query with candidates as (
 select a.id from private.media_assets a where
 (a.status='deleting') or
 (a.status='pending' and a.expires_at<now()-interval '15 minutes') or
 (a.status='uploaded' and a.created_at<now()-interval '1 day' and not exists(
 select 1 from public.films f where a.id in (f.film_asset_id,f.hook_asset_id,f.poster_asset_id)))
 order by a.created_at limit 100 for update skip locked
 ) update private.media_assets a set status='deleting' from candidates c where a.id=c.id returning a.*;
 end; $$;
create or replace function public.backend_release_asset(p_id uuid) returns void language sql security definer set search_path='' as $$
 update private.media_assets set status='rejected',source_deleted=true where id=p_id and status='deleting'; $$;
create function public.backend_duplicate_sources() returns setof private.media_assets language sql stable security definer set search_path='' as $$
 select * from private.media_assets where status='ready' and not source_deleted order by created_at limit 100; $$;
create function public.backend_source_deleted(p_id uuid) returns void language sql security definer set search_path='' as $$
 update private.media_assets set source_deleted=true where id=p_id and status='ready'; $$;
-- Serialize promotion with cleanup. Copy may have succeeded before cleanup claimed an unused
-- old asset; promotion fails closed, leaving only an unreferenced public key for ops cleanup.
revoke all on function public.backend_claim_expired_assets(),public.backend_duplicate_sources(),public.backend_source_deleted(uuid) from public,anon,authenticated;
grant execute on function public.backend_claim_expired_assets(),public.backend_duplicate_sources(),public.backend_source_deleted(uuid) to service_role;
