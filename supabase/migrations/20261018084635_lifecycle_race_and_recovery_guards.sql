-- Serialize all film asset attachment with owner removal; reject terminal assets.
create or replace function private.guard_media_references() returns trigger language plpgsql security definer set search_path='' as $$
 declare a record;
 begin
 perform 1 from private.user_state where user_id=new.owner_id for update;
 if new.status='published' and (not private.profile_available(new.owner_id) or not private.film_available(new.id)) then raise exception 'Film unavailable' using errcode='42501'; end if;
 for a in select x.* from private.media_assets x where x.id in (new.film_asset_id,new.hook_asset_id,new.poster_asset_id) order by x.id for update loop
 if a.owner_id<>new.owner_id or a.status in ('deleting','rejected') or (new.status='published' and a.status<>'ready') then raise exception 'Media unavailable' using errcode='42501'; end if;
 end loop;
 if exists(select 1 from (values(new.film_asset_id,'film'),(new.hook_asset_id,'hook'),(new.poster_asset_id,'poster')) r(id,kind)
 where r.id is not null and not exists(select 1 from private.media_assets x where x.id=r.id and x.owner_id=new.owner_id and x.kind=r.kind)) then
 raise exception 'Invalid owned media reference' using errcode='42501'; end if;
 return new;
 end; $$;
-- Profile image references share the same owner lock and verified ownership boundary.
create function private.guard_profile_picture() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if new.profile_pic_key is not distinct from old.profile_pic_key or new.profile_pic_key is null then return new; end if;
 perform 1 from private.user_state where user_id=new.id for update;
 if not exists(select 1 from private.media_assets where owner_id=new.id and kind='profile_picture' and public_key=new.profile_pic_key and status='ready' for update) then
 raise exception 'Verified owned profile picture required' using errcode='42501'; end if;
 return new;
 end; $$;
create trigger profiles_owned_picture before update of profile_pic_key on public.profiles for each row execute function private.guard_profile_picture();
revoke all on function private.guard_profile_picture() from public,anon,authenticated;

-- Include copies already in flight when suspension begins; enqueue_media waits
-- beyond the registered promotion window before touching their public key.
do $$ declare definition text; begin
 select pg_get_functiondef('public.moderate_profile(uuid,boolean,text)'::regprocedure) into definition;
 definition:=replace(definition,'where owner_id=p_profile and kind=''profile_picture'' and status=''ready''',
 'where owner_id=p_profile and (status in (''ready'',''restoring'') or (status=''uploaded'' and promotion_until is not null))');
 execute definition;
 select pg_get_functiondef('public.backend_begin_account_deletion(text,text,boolean,uuid)'::regprocedure) into definition;
 definition:=replace(definition,'if exists(select 1 from private.founder_moderators where profile_id=v_profile) then',
 'if not p_clerk_deleted and exists(select 1 from private.founder_moderators where profile_id=v_profile) then');
 execute definition;
end $$;

-- Completed media can finalize; stalled media does not monopolize provider retries.
alter table private.account_deletion_jobs add column available_at timestamptz not null default now();
alter table private.account_deletion_jobs add column attempts integer not null default 0;
create or replace function public.backend_pending_account_deletions() returns setof private.account_deletion_jobs language sql stable security definer set search_path='' as $$
 select j.* from private.account_deletion_jobs j where j.available_at<=now() and
 (not j.clerk_deleted or (
 not exists(select 1 from private.media_jobs m where m.owner_id=j.profile_id and (m.state<>'complete' or m.action<>'delete'))
 and not exists(select 1 from private.media_assets a where a.owner_id=j.profile_id and a.status<>'rejected')))
 order by j.clerk_deleted,j.available_at,j.created_at limit 3; $$;
create function public.backend_defer_account_deletion(p_job uuid) returns void language sql security definer set search_path='' as $$
 update private.account_deletion_jobs set attempts=attempts+1,available_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts+1,7)))::integer) where id=p_job; $$;
revoke all on function public.backend_defer_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.backend_defer_account_deletion(uuid) to service_role;

-- Embeddings have no FK because they cover two entity kinds. Explicitly remove
-- derived vectors and related moderation records with the source entity.
create function private.remove_deleted_entity_state() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 delete from private.entity_embeddings where kind=case when tg_table_name='films' then 'film' else 'profile' end and entity_id=old.id;
 delete from private.moderation_audit where target_id=old.id or (tg_table_name='profiles' and actor=old.id);
 return old;
 end; $$;
create trigger films_delete_derived_state before delete on public.films for each row execute function private.remove_deleted_entity_state();
create trigger profiles_delete_derived_state before delete on public.profiles for each row execute function private.remove_deleted_entity_state();
revoke all on function private.remove_deleted_entity_state() from public,anon,authenticated;
-- Promotion updates the profile picture under the same owner->asset lock order.
do $$ declare definition text; begin
 select pg_get_functiondef('public.backend_finish_promotion(uuid,uuid,uuid)'::regprocedure) into definition;
 definition:=replace(definition,'begin','begin'||chr(10)||' perform 1 from private.user_state where user_id=p_owner for update;');
 execute definition;
end $$;

-- Honest cold-start fallback: selected mood/genre labels influence initial ranking;
-- no invented vectors, synchronous inference dependency, or another user's taste.
create function private.onboarding_affinity(p_film uuid) returns double precision language sql stable security definer set search_path='' as $$
 select coalesce((select .15*count(distinct choice)::double precision/3
 from private.onboarding_preferences p cross join lateral unnest(p.choices) choice
 join public.films f on f.id=p_film
 where p.user_id=private.current_profile_id() and private.profile_available(f.owner_id) and private.film_available(f.id)
 and exists(select 1 from unnest(f.mood_tags||f.genres) label where lower(trim(label))=choice)),0); $$;
revoke all on function private.onboarding_affinity(uuid) from public,anon,authenticated;
grant execute on function private.onboarding_affinity(uuid) to anon,authenticated,service_role;
do $$ declare definition text; begin
 select pg_get_functiondef('private.loop_affinity(uuid)'::regprocedure) into definition;
 definition:=replace(definition,'coalesce(private.film_affinity(p_film),0)','coalesce(private.film_affinity(p_film),0)+private.onboarding_affinity(p_film)');
 execute definition;
end $$;

-- Candidate discovery is not authority: serialize with attachment and recheck in
-- a fresh statement after the owner lock. A snapshot taken before waiting on an
-- asset lock must never authorize deletion of a newly attached draft asset.
create or replace function public.backend_enqueue_expired_media() returns integer language plpgsql security definer set search_path='' as $$
 declare candidate record; a private.media_assets; n integer:=0;
 begin
 for candidate in select id,owner_id from private.media_assets where
 (status='pending' and expires_at<now()-interval '15 minutes') or
 (status in ('uploaded','ready') and created_at<now()-interval '1 day'
 and not exists(select 1 from public.films f where media_assets.id in (f.film_asset_id,f.hook_asset_id,f.poster_asset_id))
 and not exists(select 1 from public.profiles p where p.profile_pic_key='assets/'||media_assets.id::text))
 order by created_at limit 100 loop
 perform 1 from private.user_state where user_id=candidate.owner_id for update;
 select * into a from private.media_assets where id=candidate.id for update;
 if not found then continue; end if;
 if (a.status='pending' and a.expires_at<now()-interval '15 minutes') or
 (a.status in ('uploaded','ready') and a.created_at<now()-interval '1 day'
 and not exists(select 1 from public.films f where a.id in (f.film_asset_id,f.hook_asset_id,f.poster_asset_id))
 and not exists(select 1 from public.profiles p where p.profile_pic_key='assets/'||a.id::text)) then
 perform private.enqueue_media(a.id,'delete'); n:=n+1;
 end if;
 end loop;
 return n;
 end; $$;
