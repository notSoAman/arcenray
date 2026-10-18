-- Private founder authority, revocation, and durable media work. No privileges seeded by handle.
create table private.profile_controls (
 profile_id uuid primary key references public.profiles on delete cascade,
 status text not null check(status in ('active','suspended','deleting')), reason text not null default '', updated_at timestamptz not null default now()
);
create table private.film_controls (
 film_id uuid primary key references public.films on delete cascade,
 hidden boolean not null default true, restore_requested boolean not null default false,
 reason text not null, updated_at timestamptz not null default now()
);
create table private.founder_moderators (profile_id uuid primary key references public.profiles on delete cascade);
create table private.moderation_audit (
 id uuid primary key default gen_random_uuid(), actor uuid references public.profiles on delete set null,
 target_id uuid not null, action text not null, reason text not null check(length(trim(reason)) between 3 and 1000), created_at timestamptz not null default now()
);
create table private.revoked_identities (
 issuer text not null, subject text not null, revoked_at timestamptz not null default now(), primary key(issuer,subject)
);
create table private.media_jobs (
 asset_id uuid primary key, owner_id uuid not null, object_key text not null, public_key text not null,
 content_type text not null, bytes bigint not null, etag text,
 action text not null check(action in ('delete','quarantine','restore')),
 version bigint not null default 1, state text not null default 'pending' check(state in ('pending','processing','complete')),
 available_at timestamptz not null default now(), private_delete_after timestamptz not null,
 lease_until timestamptz, attempts integer not null default 0,
 last_error text check(last_error in ('storage','purge','source_missing','database')), updated_at timestamptz not null default now()
);
create index media_jobs_due on private.media_jobs(available_at) where state<>'complete';
create table private.account_deletion_jobs (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null unique,
 issuer text not null, subject text not null, clerk_deleted boolean not null default false,
 created_at timestamptz not null default now(), unique(issuer,subject)
);
do $$ declare t text; begin
 foreach t in array array['profile_controls','film_controls','founder_moderators','moderation_audit','revoked_identities','media_jobs','account_deletion_jobs'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated',t);
 execute format('grant all on private.%I to service_role',t);
 execute format('create policy backend_only on private.%I to service_role using(true) with check(true)',t);
 end loop;
end $$;
alter table private.media_assets add column promotion_token uuid;
alter table private.media_assets add column promotion_until timestamptz;
alter table private.media_assets drop constraint media_assets_status_check;
alter table private.media_assets add constraint media_assets_status_check check(status in ('pending','uploaded','ready','deleting','rejected','quarantining','quarantined','restoring'));

create function private.profile_available(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.profile_controls where profile_id=p_id and status<>'active'); $$;
create function private.film_available(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.film_controls where film_id=p_id and hidden); $$;
create function private.is_moderator() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.founder_moderators where profile_id=private.current_profile_id()); $$;
create function public.is_moderator() returns boolean language sql stable set search_path='' as $$ select private.is_moderator(); $$;

create or replace function private.current_profile_id() returns uuid language plpgsql stable security definer set search_path='' as $$
 declare v_issuer text:=auth.jwt()->>'iss'; v_subject text:=coalesce(auth.jwt()->>'sub',nullif(current_setting('request.jwt.claim.sub',true),'')); v_provider text; result uuid;
 begin
 if exists(select 1 from private.revoked_identities where issuer=v_issuer and subject=v_subject) then return null; end if;
 select p.provider into v_provider from private.identity_providers p where p.issuer=v_issuer and p.enabled;
 if v_provider='supabase' and v_subject ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
 select p.id into result from public.profiles p join auth.users u on u.id=p.id where p.id=v_subject::uuid;
 elsif v_provider='clerk' then
 select profile_id into result from private.auth_identities i where i.issuer=v_issuer and i.subject=v_subject;
 end if;
 if not private.profile_available(result) then return null; end if;
 return result;
 end; $$;
create or replace function private.ensure_current_profile() returns uuid language plpgsql security definer set search_path='' as $$
 declare v_issuer text:=auth.jwt()->>'iss'; v_subject text:=auth.jwt()->>'sub'; result uuid;
 begin
 if auth.jwt()->>'role' is distinct from 'authenticated' or v_subject is null or length(v_subject) not between 1 and 255 or
 not exists(select 1 from private.identity_providers p where p.issuer=v_issuer and p.provider='clerk' and p.enabled) then
 raise exception 'Trusted Clerk authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_issuer||chr(31)||v_subject,0));
 if exists(select 1 from private.revoked_identities where issuer=v_issuer and subject=v_subject) then raise exception 'Account unavailable' using errcode='42501'; end if;
 select profile_id into result from private.auth_identities i where i.issuer=v_issuer and i.subject=v_subject;
 if result is not null then
 if not private.profile_available(result) then raise exception 'Account unavailable' using errcode='42501'; end if;
 return result; end if;
 result:=gen_random_uuid();
 insert into public.profiles(id,handle) values(result,replace(result::text,'-',''));
 insert into private.user_state(user_id) values(result);
 insert into private.auth_identities(issuer,subject,profile_id) values(v_issuer,v_subject,result);
 return result;
 end; $$;
create function public.get_account_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('profile_id',i.profile_id,'status',coalesce(c.status,'active'))
 from private.auth_identities i join private.identity_providers p on p.issuer=i.issuer and p.enabled
 left join private.profile_controls c on c.profile_id=i.profile_id
 where i.issuer=auth.jwt()->>'iss' and i.subject=auth.jwt()->>'sub'
 union all select jsonb_build_object('profile_id',null,'status','deleted') from private.revoked_identities r
 where r.issuer=auth.jwt()->>'iss' and r.subject=auth.jwt()->>'sub'
 and not exists(select 1 from private.auth_identities i where i.issuer=r.issuer and i.subject=r.subject); $$;
alter policy profiles_read on public.profiles using(id=(select private.current_profile_id()) or (onboarding_completed and private.profile_available(id) and not private.is_blocked(id)));
alter policy films_read on public.films using(owner_id=(select private.current_profile_id()) or (status='published' and private.profile_available(owner_id) and private.film_available(id) and not private.is_blocked(owner_id)));
create or replace function private.is_member(p_conversation uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.conversations where id=p_conversation and private.current_profile_id() in (user_low,user_high)
 and private.profile_available(user_low) and private.profile_available(user_high)
 and not private.is_blocked(case when user_low=private.current_profile_id() then user_high else user_low end)); $$;

-- Prevent cross-owner references even in drafts; otherwise foreign keys could block deletion.
do $$ begin
 if exists(select 1 from public.films f join private.media_assets a on a.id in (f.film_asset_id,f.hook_asset_id,f.poster_asset_id) where a.owner_id<>f.owner_id) then
 raise exception 'Cross-owner media references require review before migration'; end if;
end $$;
create function private.guard_media_references() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if new.status='published' and (not private.profile_available(new.owner_id) or not private.film_available(new.id)) then raise exception 'Film unavailable' using errcode='42501'; end if;
 if exists(select 1 from (values(new.film_asset_id,'film'),(new.hook_asset_id,'hook'),(new.poster_asset_id,'poster')) r(id,kind)
 where r.id is not null and not exists(select 1 from private.media_assets a where a.id=r.id and a.owner_id=new.owner_id and a.kind=r.kind)) then
 raise exception 'Invalid owned media reference' using errcode='42501'; end if;
 return new;
 end; $$;
create trigger films_owned_media before insert or update of film_asset_id,hook_asset_id,poster_asset_id,status on public.films for each row execute function private.guard_media_references();

create function private.enqueue_media(p_asset uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
 declare a private.media_assets; j private.media_jobs;
 begin
 select * into a from private.media_assets where id=p_asset for update;
 if not found or a.status='rejected' then return; end if;
 select * into j from private.media_jobs where asset_id=p_asset for update;
 if found and j.state='processing' and j.lease_until>now() then raise exception 'Media operation in progress; retry shortly' using errcode='55000'; end if;
 if j.action=p_action and j.state in ('pending','processing') then return; end if;
 insert into private.media_jobs(asset_id,owner_id,object_key,public_key,content_type,bytes,etag,action,private_delete_after,available_at)
 values(a.id,a.owner_id,a.object_key,'assets/'||a.id::text,a.content_type,coalesce(a.actual_bytes,a.expected_bytes),a.etag,p_action,greatest(now(),a.expires_at+interval '15 minutes'),greatest(now(),coalesce(a.promotion_until+interval '5 minutes',now())))
 on conflict(asset_id) do update set action=excluded.action,version=media_jobs.version+1,state='pending',available_at=excluded.available_at,lease_until=null,attempts=0,last_error=null,updated_at=now();
 update private.media_assets set status=case p_action when 'delete' then 'deleting' when 'quarantine' then 'quarantining' else 'restoring' end where id=p_asset;
 end; $$;
create function public.backend_enqueue_expired_media() returns integer language plpgsql security definer set search_path='' as $$
 declare a record; n integer:=0;
 begin
 for a in select x.id from private.media_assets x where
 (x.status='pending' and x.expires_at<now()-interval '15 minutes') or
 (x.status in ('uploaded','ready') and x.created_at<now()-interval '1 day'
 and not exists(select 1 from public.films f where x.id in (f.film_asset_id,f.hook_asset_id,f.poster_asset_id))
 and not exists(select 1 from public.profiles p where p.profile_pic_key='assets/'||x.id::text))
 order by x.created_at limit 100 for update skip locked loop
 perform private.enqueue_media(a.id,'delete'); n:=n+1;
 end loop;
 return n;
 end; $$;
create function public.backend_claim_media_jobs(p_limit integer default 3) returns setof private.media_jobs language plpgsql security definer set search_path='' as $$
 begin
 return query with candidates as (select asset_id from private.media_jobs where
 (state='pending' and available_at<=now()) or (state='processing' and lease_until<now())
 order by available_at limit greatest(1,least(p_limit,3)) for update skip locked)
 update private.media_jobs j set state='processing',lease_until=now()+interval '5 minutes',attempts=j.attempts+1,updated_at=now()
 from candidates c where j.asset_id=c.asset_id returning j.*;
 end; $$;
create function public.backend_finish_media_job(p_asset uuid,p_version bigint) returns boolean language plpgsql security definer set search_path='' as $$
 declare j private.media_jobs;
 begin
 perform 1 from private.media_assets where id=p_asset for update;
 select * into j from private.media_jobs where asset_id=p_asset and version=p_version and state='processing' and lease_until>now() for update;
 if not found then return false; end if;
 update private.media_jobs set state='complete',lease_until=null,last_error=null,updated_at=now() where asset_id=p_asset;
 update private.media_assets set status=case j.action when 'delete' then 'rejected' when 'quarantine' then 'quarantined' else 'ready' end,
 source_deleted=case when j.action='delete' then true else source_deleted end where id=p_asset;
 if j.action='restore' then
 update private.film_controls c set hidden=false,restore_requested=false,updated_at=now() from public.films f
 where f.id=c.film_id and c.restore_requested and private.profile_available(f.owner_id)
 and not exists(select 1 from private.media_assets a where a.id in (f.film_asset_id,f.hook_asset_id,f.poster_asset_id) and a.status<>'ready');
 end if;
 return true;
 end; $$;
create function public.backend_fail_media_job(p_asset uuid,p_version bigint,p_error text) returns void language sql security definer set search_path='' as $$
 update private.media_jobs set state='pending',lease_until=null,available_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::integer),
 last_error=case when p_error in ('storage','purge','source_missing','database') then p_error else 'database' end,updated_at=now()
 where asset_id=p_asset and version=p_version and state='processing' and lease_until>now(); $$;
create function public.backend_defer_media_job(p_asset uuid,p_version bigint,p_available_at timestamptz) returns void language sql security definer set search_path='' as $$
 update private.media_jobs set state='pending',lease_until=null,available_at=greatest(now()+interval '1 second',p_available_at),updated_at=now()
 where asset_id=p_asset and version=p_version and state='processing' and lease_until>now(); $$;
-- Old private-only cleanup cannot release quota before public deletion/cache purge.
create or replace function public.backend_claim_expired_assets() returns setof private.media_assets language sql security definer set search_path='' as $$ select * from private.media_assets where false; $$;
create or replace function public.backend_release_asset(p_id uuid) returns void language sql security definer set search_path='' as $$ select; $$;
create or replace function private.get_my_storage() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('quota_bytes',s.quota_bytes,
 'used_bytes',coalesce((select sum(coalesce(actual_bytes,expected_bytes)) from private.media_assets where owner_id=private.current_profile_id() and status in ('uploaded','ready','quarantining','quarantined','restoring')),0),
 'reserved_bytes',coalesce((select sum(coalesce(actual_bytes,expected_bytes)) from private.media_assets where owner_id=private.current_profile_id() and status in ('pending','deleting')),0))
 from private.user_state s where user_id=private.current_profile_id(); $$;
-- Retain reservation validation/rate limits while accounting for quarantine/deletion.
do $$ declare definition text; begin
 select pg_get_functiondef('private.reserve_upload(text,bigint,text)'::regprocedure) into definition;
 definition:=replace(definition,'''pending'',''uploaded'',''ready'',''deleting''','''pending'',''uploaded'',''ready'',''deleting'',''quarantining'',''quarantined'',''restoring''');
 execute definition;
end $$;

create function public.get_moderation_reports() returns setof public.content_reports language plpgsql stable security definer set search_path='' as $$
 begin
 if not private.is_moderator() then raise exception 'Founder access required' using errcode='42501'; end if;
 return query select * from public.content_reports order by (status='open') desc,created_at desc,id desc limit 100;
 end; $$;
create function public.moderate_report(p_report uuid,p_status text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
 begin
 if not private.is_moderator() then raise exception 'Founder access required' using errcode='42501'; end if;
 if p_status is null or p_status not in ('open','reviewed','resolved') or length(trim(p_reason)) not between 3 and 1000 or p_reason is null then raise exception 'Valid status and reason required' using errcode='22023'; end if;
 update public.content_reports set status=p_status where id=p_report;
 if not found then raise exception 'Report not found' using errcode='P0002'; end if;
 insert into private.moderation_audit(actor,target_id,action,reason) values(private.current_profile_id(),p_report,'report_'||p_status,trim(p_reason));
 end; $$;
create function private.hide_film(p_film uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
 declare a record;
 begin
 -- Shared assets imply identical public bytes: hide every film referencing them.
 insert into private.film_controls(film_id,hidden,restore_requested,reason)
 select f.id,true,false,p_reason from public.films f where f.id=p_film or exists(
 select 1 from public.films target where target.id=p_film and
 array[f.film_asset_id,f.hook_asset_id,f.poster_asset_id] && array[target.film_asset_id,target.hook_asset_id,target.poster_asset_id])
 on conflict(film_id) do update set hidden=true,restore_requested=false,reason=excluded.reason,updated_at=now();
 for a in select distinct x.id from private.media_assets x join public.films f on x.id in (f.film_asset_id,f.hook_asset_id,f.poster_asset_id)
 where f.id=p_film and x.status in ('ready','restoring','quarantined','quarantining') loop
 if (select status from private.media_assets where id=a.id)<>'quarantined' then perform private.enqueue_media(a.id,'quarantine'); end if;
 end loop;
 end; $$;
create function public.moderate_film(p_film uuid,p_hidden boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
 declare a record; f public.films;
 begin
 if not private.is_moderator() then raise exception 'Founder access required' using errcode='42501'; end if;
 if p_hidden is null or p_reason is null or length(trim(p_reason)) not between 3 and 1000 then raise exception 'Reason required' using errcode='22023'; end if;
 select * into f from public.films where id=p_film for update;
 if not found then raise exception 'Film not found' using errcode='P0002'; end if;
 if p_hidden then perform private.hide_film(p_film,trim(p_reason));
 else
 if not private.profile_available(f.owner_id) then raise exception 'Reactivate owner before restoring film' using errcode='22023'; end if;
 insert into private.film_controls(film_id,hidden,restore_requested,reason) values(p_film,true,true,trim(p_reason))
 on conflict(film_id) do update set restore_requested=true,reason=excluded.reason,updated_at=now();
 for a in select id,status from private.media_assets where id in (f.film_asset_id,f.hook_asset_id,f.poster_asset_id) loop
 if a.status in ('quarantined','quarantining','restoring') then perform private.enqueue_media(a.id,'restore');
 elsif a.status<>'ready' then raise exception 'Media unavailable for restoration' using errcode='22023'; end if;
 end loop;
 update private.film_controls set hidden=false,restore_requested=false where film_id=p_film
 and not exists(select 1 from private.media_assets where id in (f.film_asset_id,f.hook_asset_id,f.poster_asset_id) and status<>'ready');
 end if;
 insert into private.moderation_audit(actor,target_id,action,reason) values(private.current_profile_id(),p_film,case when p_hidden then 'hide_film' else 'restore_film' end,trim(p_reason));
 end; $$;
create function public.moderate_profile(p_profile uuid,p_suspended boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
 declare f record; a record;
 begin
 if not private.is_moderator() then raise exception 'Founder access required' using errcode='42501'; end if;
 if p_suspended is null or p_reason is null or length(trim(p_reason)) not between 3 and 1000 then raise exception 'Reason required' using errcode='22023'; end if;
 if exists(select 1 from private.founder_moderators where profile_id=p_profile) then raise exception 'Cannot suspend founder moderator' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_profile) then raise exception 'Profile not found' using errcode='P0002'; end if;
 if exists(select 1 from private.profile_controls where profile_id=p_profile and status='deleting') then raise exception 'Deletion cannot be reversed' using errcode='22023'; end if;
 insert into private.profile_controls(profile_id,status,reason) values(p_profile,case when p_suspended then 'suspended' else 'active' end,trim(p_reason))
 on conflict(profile_id) do update set status=excluded.status,reason=excluded.reason,updated_at=now();
 if p_suspended then
 for f in select id from public.films where owner_id=p_profile and status='published' loop perform private.hide_film(f.id,trim(p_reason)); end loop;
 for a in select id from private.media_assets where owner_id=p_profile and kind='profile_picture' and status='ready' loop perform private.enqueue_media(a.id,'quarantine'); end loop;
 else
 -- Films require explicit separate founder restoration; do not undo earlier takedowns.
 for a in select id from private.media_assets where owner_id=p_profile and kind='profile_picture' and status in ('quarantined','quarantining') loop perform private.enqueue_media(a.id,'restore'); end loop;
 end if;
 insert into private.moderation_audit(actor,target_id,action,reason) values(private.current_profile_id(),p_profile,case when p_suspended then 'suspend_profile' else 'reactivate_profile' end,trim(p_reason));
 end; $$;

create function public.backend_begin_account_deletion(p_issuer text,p_subject text,p_clerk_deleted boolean default false,p_profile uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare v_profile uuid; v_job uuid; a record;
 begin
 if p_subject is null or p_subject !~ '^user_[A-Za-z0-9]+$' or p_clerk_deleted is null then raise exception 'Invalid identity' using errcode='22023'; end if;
 if not exists(select 1 from private.identity_providers where issuer=p_issuer and provider='clerk' and enabled) then raise exception 'Issuer not configured' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_issuer||chr(31)||p_subject,0));
 select profile_id into v_profile from private.auth_identities where issuer=p_issuer and subject=p_subject;
 if v_profile is null then return null; end if;
 if p_profile is not null and p_profile<>v_profile then raise exception 'Identity mismatch' using errcode='42501'; end if;
 if exists(select 1 from private.founder_moderators where profile_id=v_profile) then raise exception 'Transfer moderator ownership before deleting founder account' using errcode='42501'; end if;
 insert into private.revoked_identities(issuer,subject) select issuer,subject from private.auth_identities where profile_id=v_profile on conflict do nothing;
 insert into private.revoked_identities(issuer,subject) select issuer,v_profile::text from private.identity_providers where provider='supabase' on conflict do nothing;
 insert into private.profile_controls(profile_id,status,reason) values(v_profile,'deleting','Account deletion requested')
 on conflict(profile_id) do update set status='deleting',reason=excluded.reason,updated_at=now();
 for a in select id from private.media_assets where owner_id=v_profile and status<>'rejected' order by id loop perform private.enqueue_media(a.id,'delete'); end loop;
 insert into private.account_deletion_jobs(profile_id,issuer,subject,clerk_deleted) values(v_profile,p_issuer,p_subject,p_clerk_deleted)
 on conflict(profile_id) do update set clerk_deleted=account_deletion_jobs.clerk_deleted or excluded.clerk_deleted returning id into v_job;
 return v_job;
 end; $$;
create function public.backend_pending_account_deletions() returns setof private.account_deletion_jobs language sql stable security definer set search_path='' as $$
 select * from private.account_deletion_jobs order by created_at limit 3; $$;
create function public.backend_mark_clerk_deleted(p_job uuid) returns void language sql security definer set search_path='' as $$
 update private.account_deletion_jobs set clerk_deleted=true where id=p_job; $$;
create function public.backend_finish_account_deletion(p_job uuid) returns boolean language plpgsql security definer set search_path='' as $$
 declare j private.account_deletion_jobs;
 begin
 select * into j from private.account_deletion_jobs where id=p_job for update;
 if not found then return true; end if;
 if not j.clerk_deleted or exists(select 1 from private.media_jobs where owner_id=j.profile_id and (state<>'complete' or action<>'delete')) then return false; end if;
 if exists(select 1 from private.media_assets where owner_id=j.profile_id and status<>'rejected') then return false; end if;
 -- Cascades remove films, both sides of conversations/messages, events and private mappings.
 delete from public.profiles where id=j.profile_id;
 delete from auth.users where id=j.profile_id;
 delete from private.media_jobs where owner_id=j.profile_id;
 delete from private.account_deletion_jobs where id=p_job;
 return true;
 end; $$;
-- Default function EXECUTE grants are never authority. Scope every new function.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='private' and p.proname in ('profile_available','film_available','is_moderator','guard_media_references','enqueue_media','hide_film')) or
 (n.nspname='public' and p.proname in ('is_moderator','get_account_status','get_moderation_reports','moderate_report','moderate_film','moderate_profile','backend_enqueue_expired_media','backend_claim_media_jobs','backend_finish_media_job','backend_fail_media_job','backend_defer_media_job','backend_begin_account_deletion','backend_pending_account_deletions','backend_mark_clerk_deleted','backend_finish_account_deletion')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 if f.nspname='public' and f.proname not like 'backend_%' then execute format('grant execute on function %s to authenticated',f.signature); end if;
 if f.nspname='private' and f.proname in ('profile_available','film_available') then execute format('grant execute on function %s to anon,authenticated',f.signature); end if;
 if f.nspname='private' and f.proname='is_moderator' then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end $$;

-- Register publication BEFORE external CopyObject. Lifecycle work waits out any
-- in-flight bounded copy, even if its HTTP response or SQL completion is lost.
create function public.backend_begin_promotion(p_id uuid,p_owner uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare token uuid:=gen_random_uuid(); a private.media_assets;
 begin
 select * into a from private.media_assets where id=p_id and owner_id=p_owner for update;
 if not found or a.status<>'uploaded' or a.etag is null or not private.profile_available(p_owner)
 or (a.promotion_until is not null and a.promotion_until>now())
 or exists(select 1 from public.films f join private.film_controls c on c.film_id=f.id and c.hidden where a.id in (f.film_asset_id,f.hook_asset_id,f.poster_asset_id)) then
 raise exception 'Asset not available for promotion' using errcode='55000'; end if;
 update private.media_assets set promotion_token=token,promotion_until=now()+interval '5 minutes' where id=p_id;
 return token;
 end; $$;
create function public.backend_finish_promotion(p_id uuid,p_owner uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare a private.media_assets;
 begin
 update private.media_assets set status='ready',public_key='assets/'||id::text,promotion_token=null,promotion_until=null
 where id=p_id and owner_id=p_owner and status='uploaded' and promotion_token=p_token and promotion_until>now() and private.profile_available(p_owner) returning * into a;
 if not found then raise exception 'Promotion changed; cleanup will reconcile' using errcode='55000'; end if;
 if a.kind='profile_picture' then update public.profiles set profile_pic_key=a.public_key where id=p_owner; end if;
 return to_jsonb(a);
 end; $$;
create or replace function public.backend_promote_asset(p_id uuid,p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 begin raise exception 'Use leased promotion' using errcode='55000'; end; $$;
revoke all on function public.backend_begin_promotion(uuid,uuid),public.backend_finish_promotion(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.backend_begin_promotion(uuid,uuid),public.backend_finish_promotion(uuid,uuid,uuid) to service_role;

-- Trusted write helpers must honor the same availability gates as public reads.
create or replace function private.open_conversation(p_other_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare me uuid:=private.current_profile_id(); cid uuid;
 begin
 if me is null or me=p_other_user or not private.profile_available(p_other_user) or private.is_blocked(p_other_user) or not exists(select 1 from public.profiles where id=p_other_user and onboarding_completed) then raise exception 'Conversation not permitted' using errcode='42501'; end if;
 insert into public.conversations(user_low,user_high) values(least(me,p_other_user),greatest(me,p_other_user)) on conflict(user_low,user_high) do update set user_low=excluded.user_low returning id into cid;
 insert into public.conversation_participants(conversation_id,user_id) values(cid,me),(cid,p_other_user) on conflict do nothing;
 return cid;
 end; $$;
do $$ declare f record; definition text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('record_event','set_film_feedback','respond_to_credit') loop
 definition:=pg_get_functiondef(f.oid);
 if position('and not private.is_blocked(owner_id)' in definition)>0 then definition:=replace(definition,'and not private.is_blocked(owner_id)','and private.profile_available(owner_id) and private.film_available(id) and not private.is_blocked(owner_id)'); end if;
 if position('and not private.is_blocked(f.owner_id)' in definition)>0 then definition:=replace(definition,'and not private.is_blocked(f.owner_id)','and private.profile_available(f.owner_id) and private.film_available(f.id) and not private.is_blocked(f.owner_id)'); end if;
 if f.oid='private.respond_to_credit(uuid,boolean)'::regprocedure then definition:=replace(definition,'owner_id<>private.current_profile_id()','owner_id<>private.current_profile_id() and private.profile_available(owner_id) and private.film_available(id)'); end if;
 execute definition;
 end loop;
end $$;

create function public.delete_my_film(p_film uuid,p_confirmation text) returns void language plpgsql security definer set search_path='' as $$
 declare actor uuid:=private.current_profile_id(); f public.films; a uuid;
 begin
 if actor is null or p_confirmation is distinct from 'DELETE FILM' then raise exception 'Authentication and confirmation required' using errcode='42501'; end if;
 select * into f from public.films where id=p_film and owner_id=actor for update;
 if not found then raise exception 'Owned film not found' using errcode='42501'; end if;
 -- Serialize same-owner removal with publication/reservation and account deletion.
 perform 1 from private.user_state where user_id=actor for update;
 delete from public.films where id=p_film;
 foreach a in array array[f.film_asset_id,f.hook_asset_id,f.poster_asset_id] loop
 if a is not null and not exists(select 1 from public.films where a in (film_asset_id,hook_asset_id,poster_asset_id))
 and not exists(select 1 from public.profiles where profile_pic_key='assets/'||a::text) then
 perform private.enqueue_media(a,'delete'); end if;
 end loop;
 end; $$;
revoke all on function public.delete_my_film(uuid,text) from public,anon,authenticated;
grant execute on function public.delete_my_film(uuid,text) to authenticated,service_role;
