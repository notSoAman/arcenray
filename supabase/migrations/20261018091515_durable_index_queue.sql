-- REVIEW ONLY: durable indexing + one-minute operations cron require founder approval.
create sequence private.index_job_version_seq;
revoke all on sequence private.index_job_version_seq from public,anon,authenticated;
grant usage on sequence private.index_job_version_seq to service_role;
create table private.index_jobs (
 kind text not null check(kind in ('film','profile')), entity_id uuid not null,
 owner_id uuid not null references public.profiles on delete cascade,
 version bigint not null default nextval('private.index_job_version_seq'),
 source_updated_at timestamptz not null, content_hash text not null,
 state text not null default 'pending' check(state in ('pending','processing','cancelled')),
 attempts integer not null default 0 check(attempts>=0),
 available_at timestamptz not null default now(),lease_until timestamptz,
 primary key(kind,entity_id)
);
create index index_jobs_due on private.index_jobs(available_at) where state<>'cancelled';
alter table private.index_jobs enable row level security;
revoke all on private.index_jobs from public,anon,authenticated;
grant all on private.index_jobs to service_role;
create policy backend_only on private.index_jobs to service_role using(true) with check(true);

-- Never persist request-supplied text or enqueue private/draft/inactive sources.
create function private.index_source(p_kind text,p_id uuid)
returns table(owner_id uuid,source_updated_at timestamptz,content text)
language sql stable security definer set search_path='' as $$
 select f.owner_id,f.updated_at,left(concat_ws(E'\n',nullif(f.title,''),nullif(array_to_string(f.genres,', '),''),
 nullif(array_to_string(f.mood_tags,', '),''),nullif(f.location_city,''),nullif(f.language,''),nullif(f.synopsis,''),
 (select string_agg(c.display_name||': '||c.role,E'\n' order by c.id) from public.film_credits c where c.film_id=f.id and c.verification_state='accepted')),6000)
 from public.films f where p_kind='film' and f.id=p_id and f.status='published'
 and private.profile_available(f.owner_id) and private.film_available(f.id)
 union all
 select p.id,p.updated_at,left(concat_ws(E'\n',nullif(p.full_name,''),nullif(array_to_string(p.roles,', '),''),
 nullif(array_to_string(p.skills_gear,', '),''),nullif(p.location_city,''),nullif(p.bio,''),
 (select string_agg(c.role,E'\n' order by c.id) from public.film_credits c join public.films f on f.id=c.film_id
 where c.profile_id=p.id and c.verification_state='accepted' and f.status='published'
 and private.profile_available(f.owner_id) and private.film_available(f.id))),6000)
 from public.profiles p where p_kind='profile' and p.id=p_id and p.onboarding_completed and private.profile_available(p.id);
$$;
create function private.enqueue_index(p_kind text,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
 declare s record; fingerprint text;
 begin
 select * into s from private.index_source(p_kind,p_id);
 if not found then
 delete from private.entity_embeddings where kind=p_kind and entity_id=p_id;
 -- Preserve the current lease version so its late worker can remove only its
 -- own just-written vector after cancellation, without touching newer work.
 update private.index_jobs set state='cancelled',lease_until=null where kind=p_kind and entity_id=p_id;
 return;
 end if;
 fingerprint:=encode(sha256(convert_to(s.content,'UTF8')),'hex');
 if exists(select 1 from private.entity_embeddings e where e.kind=p_kind and e.entity_id=p_id and e.content_hash=fingerprint) then
 delete from private.index_jobs where kind=p_kind and entity_id=p_id;
 return;
 end if;
 delete from private.entity_embeddings where kind=p_kind and entity_id=p_id;
 insert into private.index_jobs(kind,entity_id,owner_id,source_updated_at,content_hash)
 values(p_kind,p_id,s.owner_id,s.source_updated_at,fingerprint)
 on conflict(kind,entity_id) do update set owner_id=excluded.owner_id,source_updated_at=excluded.source_updated_at,
 content_hash=excluded.content_hash,version=nextval('private.index_job_version_seq'),state='pending',attempts=0,available_at=now(),lease_until=null
 where index_jobs.source_updated_at is distinct from excluded.source_updated_at or index_jobs.content_hash<>excluded.content_hash or index_jobs.state='cancelled';
 end; $$;

-- Existing precise invalidators are replaced by one transactional queue/invalidation
-- trigger. Publication/onboarding and non-text updates cannot strand stale CAS jobs.
drop trigger films_embedding_stale on public.films;
drop trigger films_language_embedding_stale on public.films;
drop trigger profiles_embedding_stale on public.profiles;
create function private.queue_source_index() returns trigger language plpgsql security definer set search_path='' as $$
 declare k text:=case when tg_table_name='films' then 'film' else 'profile' end; eid uuid; p record;
 begin
 if tg_op='DELETE' then
 delete from private.index_jobs where kind=k and entity_id=old.id;
 return old;
 end if;
 eid:=new.id;
 perform private.enqueue_index(k,eid);
 if k='film' then
 for p in select distinct profile_id from public.film_credits where film_id=eid and profile_id is not null loop
 -- Credit visibility is derived from film publication/controls. Advance the
 -- profile's real CAS timestamp, so an older worker cannot overwrite its new
 -- public credit text merely because profile fields were otherwise unchanged.
 update public.profiles set updated_at=now() where id=p.profile_id;
 end loop;
 end if;
 return new;
 end; $$;
create trigger films_queue_index after insert or update or delete on public.films for each row execute function private.queue_source_index();
create trigger profiles_queue_index after insert or update or delete on public.profiles for each row execute function private.queue_source_index();

-- Credit inserts/verification/deletion must invalidate both old and new targets.
create or replace function private.credit_changed() returns trigger language plpgsql security definer set search_path='' as $$
 declare old_fid uuid; old_pid uuid; new_fid uuid; new_pid uuid; target uuid;
 begin
 if tg_op<>'INSERT' then old_fid:=old.film_id;old_pid:=old.profile_id;end if;
 if tg_op<>'DELETE' then new_fid:=new.film_id;new_pid:=new.profile_id;end if;
 for target in select distinct id from unnest(array[old_fid,new_fid]) id where id is not null loop
 update public.films set updated_at=now() where id=target;
 end loop;
 for target in select distinct id from unnest(array[old_pid,new_pid]) id where id is not null loop
 update public.profiles set updated_at=now() where id=target;
 end loop;
 return null;
 end; $$;
create function private.queue_control_index() returns trigger language plpgsql security definer set search_path='' as $$
 declare target uuid; f record; p record;
 begin
 if tg_table_name='profile_controls' then
 target:=case when tg_op='DELETE' then old.profile_id else new.profile_id end;
 perform private.enqueue_index('profile',target);
 for f in select id from public.films where owner_id=target loop
 perform private.enqueue_index('film',f.id);
 for p in select distinct profile_id from public.film_credits where film_id=f.id and profile_id is not null loop update public.profiles set updated_at=now() where id=p.profile_id;end loop;
 end loop;
 else
 target:=case when tg_op='DELETE' then old.film_id else new.film_id end;
 perform private.enqueue_index('film',target);
 for p in select distinct profile_id from public.film_credits where film_id=target and profile_id is not null loop update public.profiles set updated_at=now() where id=p.profile_id;end loop;
 end if;
 return null;
 end; $$;
create trigger profile_controls_queue_index after insert or update or delete on private.profile_controls for each row execute function private.queue_control_index();
create trigger film_controls_queue_index after insert or update or delete on private.film_controls for each row execute function private.queue_control_index();

create function private.backend_claim_index_jobs(p_limit integer default 3)
returns table(kind text,entity_id uuid,owner_id uuid,version bigint,source_updated_at timestamptz,content text)
language plpgsql security definer set search_path='' as $$
 declare j private.index_jobs; s record; fingerprint text;
 begin
 if p_limit is null or p_limit<1 or p_limit>3 then raise exception 'Batch size must be 1..3' using errcode='22023'; end if;
 for j in select q.* from private.index_jobs q where (q.state='pending' and q.available_at<=now()) or (q.state='processing' and q.lease_until<now()) order by q.available_at,q.kind,q.entity_id limit p_limit for update skip locked loop
 select * into s from private.index_source(j.kind,j.entity_id);
 if not found then update private.index_jobs q set state='cancelled',lease_until=null where q.kind=j.kind and q.entity_id=j.entity_id;continue;end if;
 fingerprint:=encode(sha256(convert_to(s.content,'UTF8')),'hex');
 if exists(select 1 from private.entity_embeddings e where e.kind=j.kind and e.entity_id=j.entity_id and e.content_hash=fingerprint) then delete from private.index_jobs q where q.kind=j.kind and q.entity_id=j.entity_id;continue;end if;
 update private.index_jobs q set owner_id=s.owner_id,source_updated_at=s.source_updated_at,content_hash=fingerprint,
 version=nextval('private.index_job_version_seq'),state='processing',attempts=q.attempts+1,lease_until=now()+interval '2 minutes'
 where q.kind=j.kind and q.entity_id=j.entity_id returning q.* into j;
 return query select j.kind,j.entity_id,j.owner_id,j.version,j.source_updated_at,s.content;
 end loop;
 end; $$;
create function private.backend_finish_index_job(p_kind text,p_id uuid,p_version bigint,p_success boolean) returns boolean
language plpgsql security definer set search_path='' as $$
 declare j private.index_jobs; s record; fingerprint text;
 begin
 if p_kind is null or p_kind not in ('film','profile') or p_id is null or p_version is null or p_version<1 or p_success is null then raise exception 'Invalid completion' using errcode='22023';end if;
 select * into j from private.index_jobs q where q.kind=p_kind and q.entity_id=p_id and q.version=p_version for update;
 if not found then return false;end if;
 select * into s from private.index_source(p_kind,p_id);
 if not found then
 delete from private.entity_embeddings e where e.kind=p_kind and e.entity_id=p_id and e.content_hash=j.content_hash;
 delete from private.index_jobs q where q.kind=p_kind and q.entity_id=p_id and q.version=p_version;
 return false;
 end if;
 if j.state<>'processing' or j.lease_until<=now() then return false;end if;
 fingerprint:=encode(sha256(convert_to(s.content,'UTF8')),'hex');
 if s.source_updated_at<>j.source_updated_at or fingerprint<>j.content_hash then perform private.enqueue_index(p_kind,p_id);return false;end if;
 if p_success and exists(select 1 from private.entity_embeddings e where e.kind=p_kind and e.entity_id=p_id and e.content_hash=j.content_hash) then
 delete from private.index_jobs q where q.kind=p_kind and q.entity_id=p_id and q.version=p_version;
 return true;
 end if;
 update private.index_jobs q set state='pending',lease_until=null,available_at=now()+make_interval(secs=>least(3600,30*power(2,least(q.attempts,7)))::integer) where q.kind=p_kind and q.entity_id=p_id and q.version=p_version;
 return false;
 end; $$;
create function public.backend_claim_index_jobs(p_limit integer default 3) returns table(kind text,entity_id uuid,owner_id uuid,version bigint,source_updated_at timestamptz,content text)
language sql security invoker set search_path='' as $$ select * from private.backend_claim_index_jobs(p_limit); $$;
create function public.backend_finish_index_job(p_kind text,p_id uuid,p_version bigint,p_success boolean) returns boolean
language sql security invoker set search_path='' as $$ select private.backend_finish_index_job(p_kind,p_id,p_version,p_success); $$;

-- No new client access, no user-selected batch work, no privileged public definer.
revoke all on function private.index_source(text,uuid),private.enqueue_index(text,uuid),private.queue_source_index(),private.queue_control_index(),private.backend_claim_index_jobs(integer),private.backend_finish_index_job(text,uuid,bigint,boolean),public.backend_claim_index_jobs(integer),public.backend_finish_index_job(text,uuid,bigint,boolean) from public,anon,authenticated;
grant execute on function private.backend_claim_index_jobs(integer),private.backend_finish_index_job(text,uuid,bigint,boolean),public.backend_claim_index_jobs(integer),public.backend_finish_index_job(text,uuid,bigint,boolean) to service_role;

-- Backfill existing eligible entities without retaining private content in jobs.
do $$ declare e record;begin
 for e in select 'profile'::text kind,id from public.profiles where onboarding_completed union all select 'film',id from public.films where status='published' loop perform private.enqueue_index(e.kind,e.id);end loop;
end $$;
create function private.invoke_index_pending() returns bigint language plpgsql security definer set search_path='' as $$
 declare token text; operations_secret text; backend_issuer text; n integer; request_id bigint;
 begin
 select count(*),min(issuer) into n,backend_issuer from private.identity_providers where provider='supabase' and enabled;
 if n<>1 or backend_issuer !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/auth/v1$' then raise exception 'Exactly one trusted Supabase backend issuer is required';end if;
 select count(*),min(decrypted_secret) into n,token from vault.decrypted_secrets where name='arcenray_cleanup_service_role';
 if n<>1 or token is null or token='' then raise exception 'Operations JWT is not configured';end if;
 select count(*),min(decrypted_secret) into n,operations_secret from vault.decrypted_secrets where name='arcenray_cleanup_secret';
 if n<>1 or operations_secret is null or operations_secret='' then raise exception 'Operations secret is not configured';end if;
 select net.http_post(url:=regexp_replace(backend_issuer,'/auth/v1$','')||'/functions/v1/index-pending',
 headers:=jsonb_build_object('Authorization','Bearer '||token,'x-cleanup-secret',operations_secret,'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=60000) into request_id;
 return request_id;
 end; $$;
revoke all on function private.invoke_index_pending() from public,anon,authenticated,service_role;
select cron.schedule('arcenray-index-pending','* * * * *','select private.invoke_index_pending()');
