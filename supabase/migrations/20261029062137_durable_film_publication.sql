-- An explicit, owner-authorized publication request survives closing the browser.
-- Only its saved content/assets may publish; edits cancel the request.
create table private.film_publication_requests (
 film_id uuid primary key references public.films on delete cascade,
 owner_id uuid not null references public.profiles on delete cascade,
 snapshot jsonb not null,
 state text not null check(state in ('pending','processing','complete','cancelled','failed')),
 attempts integer not null default 0,
 available_at timestamptz not null default now(),
 lease_token uuid,
 lease_until timestamptz,
 requested_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table private.film_publication_requests enable row level security;
revoke all on private.film_publication_requests from public,anon,authenticated;
grant all on private.film_publication_requests to service_role;
create policy backend_only on private.film_publication_requests to service_role using(true) with check(true);
create index film_publication_pending on private.film_publication_requests(available_at)
 where state in ('pending','processing');

create function private.publication_snapshot(f public.films) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('title',f.title,'synopsis',f.synopsis,'genres',f.genres,
 'mood_tags',f.mood_tags,'location_city',f.location_city,'language',f.language,
 'source',f.source,'provider_id',f.provider_id,'film_asset_id',f.film_asset_id,
 'hook_asset_id',f.hook_asset_id,'poster_asset_id',f.poster_asset_id);
$$;

create function private.set_film_publication(p_film uuid,p_enabled boolean) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.current_profile_id(); f public.films;
begin
 perform 1 from public.profiles where id=actor for update;
 select * into f from public.films where id=p_film and owner_id=actor for update;
 if not found then raise exception 'Film not permitted' using errcode='42501'; end if;
 if f.status='published' then return 'complete'; end if;
 if not coalesce(p_enabled,false) then
   update private.film_publication_requests set state='cancelled',lease_token=null,lease_until=null,updated_at=now() where film_id=f.id;
   return 'cancelled';
 end if;
 if f.status<>'draft' or not private.profile_available(actor) or not private.film_available(f.id)
   or not exists(select 1 from public.profiles where id=actor and onboarding_completed) then
   raise exception 'Film not available for publication' using errcode='42501';
 end if;
 if f.source='r2_native' and (f.film_asset_id is null or not exists(
   select 1 from private.media_processing_jobs where asset_id=f.film_asset_id and owner_id=actor and state in ('queued','processing','complete'))) then
   raise exception 'Finish uploading your film before publishing';
 end if;
 if exists(select 1 from (values(f.film_asset_id,'film'),(f.hook_asset_id,'hook'),(f.poster_asset_id,'poster')) r(id,kind)
   where r.id is not null and not exists(select 1 from private.media_assets a where a.id=r.id and a.owner_id=actor
     and a.kind=r.kind and a.status in ('uploaded','ready'))) then
   raise exception 'Finish uploading the selected files before publishing';
 end if;
 insert into private.film_publication_requests(film_id,owner_id,snapshot,state)
 values(f.id,actor,private.publication_snapshot(f),'pending')
 on conflict(film_id) do update set snapshot=excluded.snapshot,state='pending',attempts=0,
   available_at=now(),lease_token=null,lease_until=null,requested_at=now(),updated_at=now()
 where film_publication_requests.state not in ('pending','processing')
   or film_publication_requests.snapshot is distinct from excluded.snapshot;
 return 'pending';
end; $$;

create function private.get_film_publication(p_film uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',case when f.status='published' then 'complete' else r.state end)
 from public.films f left join private.film_publication_requests r on r.film_id=f.id
 where f.id=p_film and f.owner_id=private.current_profile_id();
$$;

create function private.cancel_changed_publication() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'draft' or private.publication_snapshot(new) is distinct from private.publication_snapshot(old) then
   update private.film_publication_requests set state=case when new.status='published' then 'complete' else 'cancelled' end,
     lease_token=null,lease_until=null,updated_at=now() where film_id=new.id and state in ('pending','processing');
 end if;
 return new;
end; $$;
create trigger cancel_changed_publication after update on public.films
 for each row execute function private.cancel_changed_publication();

create function private.backend_claim_film_publication() returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.film_publication_requests; f public.films; token uuid:=gen_random_uuid();
begin
 -- Incompatible media is terminal until the owner explicitly fixes/retries it.
 update private.film_publication_requests q set state='failed',updated_at=now()
 from public.films film join private.media_processing_jobs j on j.asset_id=film.film_asset_id
 where q.film_id=film.id and q.state='pending' and j.state in ('failed','cancelled');
 select q.* into r from private.film_publication_requests q join public.films film on film.id=q.film_id
 where ((q.state='pending' and q.available_at<=now()) or (q.state='processing' and q.lease_until<now()))
 and (film.source<>'r2_native' or exists(select 1 from private.media_processing_jobs j where j.asset_id=film.film_asset_id and j.state='complete'))
 order by q.available_at limit 1 for update of q skip locked;
 if not found then return null; end if;
 select * into f from public.films where id=r.film_id;
 if f.status<>'draft' or not private.profile_available(r.owner_id) or not private.film_available(f.id)
   or private.publication_snapshot(f) is distinct from r.snapshot then
   update private.film_publication_requests set state='cancelled',updated_at=now() where film_id=r.film_id;
   return null;
 end if;
 if r.attempts>=6 then
   update private.film_publication_requests set state='failed',updated_at=now() where film_id=r.film_id;
   return null;
 end if;
 update private.film_publication_requests set state='processing',attempts=attempts+1,
   lease_token=token,lease_until=now()+interval '5 minutes',updated_at=now() where film_id=r.film_id;
 return jsonb_build_object('film',to_jsonb(f),'token',token);
end; $$;

create function private.backend_finish_film_publication(p_film uuid,p_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r private.film_publication_requests; f public.films; h private.media_assets; p private.media_assets; v private.media_assets;
begin
 perform 1 from public.profiles where id=(select owner_id from public.films where id=p_film) for update;
 select * into f from public.films where id=p_film for update;
 select * into r from private.film_publication_requests where film_id=p_film for update;
 if not found then return false; end if;
 if r.state='complete' and f.status='published' then return true; end if;
 if r.state<>'processing' or r.lease_token is distinct from p_token or r.lease_until<=now()
   or f.status<>'draft' or f.owner_id<>r.owner_id or private.publication_snapshot(f) is distinct from r.snapshot
   or not private.profile_available(r.owner_id) or not private.film_available(f.id) then return false; end if;
 if not exists(select 1 from public.profiles where id=r.owner_id and onboarding_completed) then return false; end if;
 select * into h from private.media_assets where id=f.hook_asset_id and owner_id=r.owner_id and kind='hook' and status='ready';
 select * into p from private.media_assets where id=f.poster_asset_id and owner_id=r.owner_id and kind='poster' and status='ready';
 if f.hook_asset_id is not null and (h.id is null or h.duration_seconds is null or h.duration_seconds>30 or h.duration_seconds<=0) then return false; end if;
 if f.poster_asset_id is not null and p.id is null then return false; end if;
 if f.source='r2_native' then
   select * into v from private.media_assets where id=f.film_asset_id and owner_id=r.owner_id and kind='film' and status='ready';
   if v.id is null or not exists(select 1 from private.media_processing_jobs where asset_id=v.id and state='complete') then return false; end if;
 end if;
 update public.films set status='published',published_at=coalesce(published_at,now()),film_key=v.public_key,
   hook_key=h.public_key,poster_key=p.public_key,duration_seconds=v.duration_seconds where id=f.id;
 -- The film trigger marks the request complete; existing indexing triggers run.
 return true;
end; $$;

create function private.backend_retry_film_publication(p_film uuid,p_token uuid) returns void
language sql security definer set search_path='' as $$
 update private.film_publication_requests set state=case when attempts>=6 then 'failed' else 'pending' end,
 available_at=now()+make_interval(secs=>least(600,10*power(2,attempts))::integer),lease_token=null,lease_until=null,updated_at=now()
 where film_id=p_film and state='processing' and lease_token=p_token;
$$;

create function public.set_film_publication(p_film uuid,p_enabled boolean) returns text language sql security invoker set search_path='' as $$ select private.set_film_publication(p_film,p_enabled); $$;
create function public.get_film_publication(p_film uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.get_film_publication(p_film); $$;
create function public.backend_claim_film_publication() returns jsonb language sql security invoker set search_path='' as $$ select private.backend_claim_film_publication(); $$;
create function public.backend_finish_film_publication(p_film uuid,p_token uuid) returns boolean language sql security invoker set search_path='' as $$ select private.backend_finish_film_publication(p_film,p_token); $$;
create function public.backend_retry_film_publication(p_film uuid,p_token uuid) returns void language sql security invoker set search_path='' as $$ select private.backend_retry_film_publication(p_film,p_token); $$;
do $$ declare fn record; begin
 for fn in select oid::regprocedure signature from pg_proc where pronamespace in ('public'::regnamespace,'private'::regnamespace)
 and proname in ('publication_snapshot','cancel_changed_publication','set_film_publication','get_film_publication',
   'backend_claim_film_publication','backend_finish_film_publication','backend_retry_film_publication') loop
 execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
 execute format('grant execute on function %s to service_role',fn.signature);
 end loop;
end $$;
grant execute on function private.set_film_publication(uuid,boolean),public.set_film_publication(uuid,boolean),
 private.get_film_publication(uuid),public.get_film_publication(uuid) to authenticated;
