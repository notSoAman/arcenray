-- Narrow service-only operations used by Edge Functions. Never grant these to clients.
create function public.backend_asset(p_id uuid,p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(a) from private.media_assets a where id=p_id and owner_id=p_owner; $$;
create function public.backend_verify_asset(p_id uuid,p_owner uuid,p_bytes bigint,p_etag text,p_width integer,p_height integer,p_duration numeric default null)
 returns jsonb language plpgsql security definer set search_path='' as $$
 declare a private.media_assets;
 begin
 select * into a from private.media_assets where id=p_id and owner_id=p_owner for update;
 if not found then raise exception 'Asset missing'; end if;
 if a.status in ('uploaded','ready') then return to_jsonb(a); end if;
 if a.status<>'pending' or a.expires_at<now() or a.expected_bytes<>p_bytes then raise exception 'Invalid upload'; end if;
 if p_width<=0 or p_height<=0 or p_width is null or p_height is null then raise exception 'Invalid dimensions'; end if;
 if a.kind='profile_picture' and (p_width>256 or p_height>256) then raise exception 'Profile picture exceeds 256px'; end if;
 if a.kind='poster' and (p_width>800 or p_height>1200) then raise exception 'Poster exceeds 800x1200'; end if;
 if a.kind in ('film','hook') and (p_duration is null or p_duration<=0 or greatest(p_width,p_height)>1920 or least(p_width,p_height)>1080) then raise exception 'Invalid video'; end if;
 if a.kind='hook' and (p_duration>30 or greatest(p_width,p_height)>1280 or least(p_width,p_height)>720) then raise exception 'Hook exceeds 30 seconds or 720p'; end if;
 update private.media_assets set status='uploaded',actual_bytes=p_bytes,etag=p_etag,width=p_width,height=p_height,duration_seconds=p_duration where id=p_id returning * into a;
 return to_jsonb(a);
 end; $$;
create function public.backend_promote_asset(p_id uuid,p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare a private.media_assets;
 begin
 update private.media_assets set status='ready',public_key='assets/'||id::text where id=p_id and owner_id=p_owner and status in ('uploaded','ready') returning * into a;
 if not found then raise exception 'Asset not verified'; end if;
 if a.kind='profile_picture' then update public.profiles set profile_pic_key=a.public_key where id=p_owner; end if;
 return to_jsonb(a);
 end; $$;
create function public.backend_expired_assets() returns setof private.media_assets language sql stable security definer set search_path='' as $$
 select * from private.media_assets where status='pending' and expires_at<now()-interval '15 minutes' order by expires_at limit 100; $$;
create function public.backend_release_asset(p_id uuid) returns void language sql security definer set search_path='' as $$
 update private.media_assets set status='rejected' where id=p_id and status='pending' and expires_at<now(); $$;
create function public.backend_set_embedding(p_kind text,p_id uuid,p_owner uuid,p_embedding extensions.vector(1536),p_hash text,p_updated_at timestamptz)
 returns boolean language plpgsql security definer set search_path='' as $$
 begin
 -- Serialize with edits; stale indexing requests cannot restore an obsolete embedding.
 if p_kind='film' then
 perform 1 from public.films where id=p_id and owner_id=p_owner and updated_at=p_updated_at for update;
 elsif p_kind='profile' then
 perform 1 from public.profiles where id=p_id and id=p_owner and updated_at=p_updated_at for update;
 else raise exception 'Invalid entity kind'; end if;
 if not found then return false; end if;
 insert into private.entity_embeddings(kind,entity_id,embedding,content_hash) values(p_kind,p_id,p_embedding,p_hash)
 on conflict(kind,entity_id) do update set embedding=excluded.embedding,content_hash=excluded.content_hash,updated_at=now();
 return true;
 end; $$;
-- Rate-limit costly operations before calling external services.
create table private.api_usage (
 user_id uuid not null references public.profiles on delete cascade, operation text not null,
 window_start timestamptz not null, calls integer not null default 1,
 primary key(user_id,operation,window_start)
);
alter table private.api_usage enable row level security;
create function public.backend_rate_limit(p_user uuid,p_operation text,p_limit integer) returns boolean language plpgsql security definer set search_path='' as $$
 declare n integer;
 begin
 insert into private.api_usage(user_id,operation,window_start) values(p_user,p_operation,date_trunc('hour',now()))
 on conflict(user_id,operation,window_start) do update set calls=private.api_usage.calls+1 returning calls into n;
 return n<=p_limit;
 end; $$;
revoke all on function public.backend_asset(uuid,uuid),public.backend_verify_asset(uuid,uuid,bigint,text,integer,integer,numeric),public.backend_promote_asset(uuid,uuid),public.backend_expired_assets(),public.backend_release_asset(uuid),public.backend_set_embedding(text,uuid,uuid,extensions.vector,text,timestamptz),public.backend_rate_limit(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.backend_asset(uuid,uuid),public.backend_verify_asset(uuid,uuid,bigint,text,integer,integer,numeric),public.backend_promote_asset(uuid,uuid),public.backend_expired_assets(),public.backend_release_asset(uuid),public.backend_set_embedding(text,uuid,uuid,extensions.vector,text,timestamptz),public.backend_rate_limit(uuid,text,integer) to service_role;
grant all on private.api_usage to service_role;
