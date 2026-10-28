-- Server-side film conversion. Originals remain private until a validated
-- output is committed; a separate cleanup claim removes the exact source key.
alter table private.media_assets drop constraint media_assets_expected_bytes_check;
alter table private.media_assets add constraint media_assets_expected_bytes_check
  check (expected_bytes > 0 and expected_bytes <= 5368709120000);
-- Keep each active multipart session's original boundary; new sessions use
-- larger parts, allowing long videos without breaking resumable old drafts.
alter table private.multipart_uploads add column part_size bigint not null default 16777216
  check (part_size between 16777216 and 536870912);
alter table private.multipart_uploads alter column part_size set default 67108864;

create table private.media_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null unique references private.media_assets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  draft_id uuid not null references public.films(id) on delete cascade,
  source_key text not null,
  source_etag text not null,
  source_bytes bigint not null check (source_bytes > 0),
  policy_version text not null default '1080p-v1' check (policy_version = '1080p-v1'),
  state text not null default 'queued' check (state in ('queued','processing','complete','failed','cancelled')),
  version bigint not null default 1,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  attempt_id uuid,
  output_key text,
  output_etag text,
  output_bytes bigint,
  output_sha256 text,
  output_width integer,
  output_height integer,
  output_duration numeric,
  source_deleted boolean not null default false,
  cleanup_lease_until timestamptz,
  last_error text check (last_error in ('processing_failed','capacity','storage','source_changed','output_invalid','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lease_token is null) = (lease_until is null)),
  check (output_sha256 is null or output_sha256 ~ '^[a-f0-9]{64}$'),
  check ((output_width is null and output_height is null and output_duration is null)
    or (output_width > 0 and output_height > 0 and output_duration > 0))
);
create index media_processing_due on private.media_processing_jobs(available_at,created_at)
  where state in ('queued','processing');
alter table private.media_processing_jobs enable row level security;
revoke all on private.media_processing_jobs from public,anon,authenticated;
grant all on private.media_processing_jobs to service_role;
create policy backend_only on private.media_processing_jobs to service_role using (true) with check (true);

-- The Oracle worker reports free scratch capacity over an authenticated Edge
-- endpoint. A 3x source + 1 GiB reserve mirrors the processor's admission rule.
create table private.media_processor_capacity (
  id boolean primary key default true check (id),
  available_bytes bigint not null check (available_bytes >= 0),
  max_source_bytes bigint not null check (max_source_bytes >= 0),
  heartbeat_at timestamptz not null default now()
);
alter table private.media_processor_capacity enable row level security;
revoke all on private.media_processor_capacity from public,anon,authenticated;
grant all on private.media_processor_capacity to service_role;
create policy backend_only on private.media_processor_capacity to service_role using (true) with check (true);

create function private.enqueue_media_processing(p_asset uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a private.media_assets; f public.films;
begin
  select * into a from private.media_assets where id=p_asset for update;
  if not found or a.kind <> 'film' or a.status <> 'uploaded' or a.etag is null
    or a.actual_bytes is null or not private.profile_available(a.owner_id) then
    raise exception 'Verified native film required' using errcode='42501';
  end if;
  select * into f from public.films where film_asset_id=a.id and owner_id=a.owner_id and status='draft' for update;
  if not found or not private.film_available(f.id) then
    raise exception 'Active owned draft required' using errcode='42501';
  end if;
  insert into private.media_processing_jobs(asset_id,owner_id,draft_id,source_key,source_etag,source_bytes)
  values(a.id,a.owner_id,f.id,a.object_key,a.etag,a.actual_bytes)
  on conflict(asset_id) do update set
    source_key=excluded.source_key, source_etag=excluded.source_etag, source_bytes=excluded.source_bytes,
    state='queued',version=media_processing_jobs.version+1,attempts=0,available_at=now(),
    lease_token=null,lease_until=null,attempt_id=null,output_key=null,output_etag=null,output_bytes=null,
    output_sha256=null,output_width=null,output_height=null,output_duration=null,source_deleted=false,
    cleanup_lease_until=null,last_error=null,updated_at=now()
  where media_processing_jobs.state in ('failed','cancelled');
end; $$;

create function private.backend_set_processor_capacity(p_available bigint) returns bigint
language plpgsql security definer set search_path='' as $$
declare maximum bigint;
begin
  if p_available is null or p_available < 0 or p_available > 1099511627776 then
    raise exception 'Invalid scratch capacity' using errcode='22023';
  end if;
  maximum := greatest(0, least(5368709120000, (p_available-1073741824)/3));
  insert into private.media_processor_capacity(id,available_bytes,max_source_bytes,heartbeat_at)
  values(true,p_available,maximum,now())
  on conflict(id) do update set available_bytes=excluded.available_bytes,
    max_source_bytes=excluded.max_source_bytes,heartbeat_at=now();
  return maximum;
end; $$;

create function private.backend_claim_media_processing(p_lease_seconds integer default 300) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.media_processing_jobs; capacity private.media_processor_capacity; token uuid; attempt uuid;
begin
  if p_lease_seconds is null or p_lease_seconds not between 60 and 900 then
    raise exception 'Invalid processing lease' using errcode='22023';
  end if;
  select * into capacity from private.media_processor_capacity where id=true;
  if not found or capacity.heartbeat_at < now()-interval '2 minutes' then return null; end if;
  select q.* into j from private.media_processing_jobs q
  join private.media_assets a on a.id=q.asset_id and a.owner_id=q.owner_id
  join public.films f on f.id=q.draft_id and f.owner_id=q.owner_id and f.film_asset_id=q.asset_id and f.status='draft'
  where ((q.state='queued' and q.available_at<=now()) or (q.state='processing' and q.lease_until<now()))
    and q.source_bytes <= capacity.max_source_bytes
    and a.status='uploaded' and a.object_key=q.source_key and a.etag=q.source_etag
    and private.profile_available(q.owner_id) and private.film_available(q.draft_id)
  order by q.available_at,q.created_at for update of q skip locked limit 1;
  if not found then return null; end if;
  token:=gen_random_uuid(); attempt:=gen_random_uuid();
  -- A prior crashed attempt may have left a completed private object behind.
  -- Its lease has expired, so exact-key cleanup is now safe to claim.
  if j.output_key is not null then
    insert into private.media_processing_cleanup(job_id,object_key,purpose,available_at)
      values(j.id,j.output_key,'attempt',now()) on conflict(job_id,object_key) do nothing;
  end if;
  update private.media_processing_jobs set state='processing',version=version+1,attempts=attempts+1,
    lease_token=token,lease_until=now()+make_interval(secs=>p_lease_seconds),attempt_id=attempt,
    output_key='processing/'||id::text||'/'||attempt::text||'/film.mp4',output_etag=null,output_bytes=null,
    output_sha256=null,output_width=null,output_height=null,output_duration=null,updated_at=now()
  where id=j.id returning * into j;
  return jsonb_build_object('job_id',j.id,'asset_id',j.asset_id,'owner_id',j.owner_id,'draft_id',j.draft_id,
    'source_key',j.source_key,'source_etag',j.source_etag,'source_bytes',j.source_bytes,
    'policy_version',j.policy_version,'version',j.version,'lease_token',j.lease_token,'lease_until',j.lease_until,
    'attempt_id',j.attempt_id,'output_key',j.output_key);
end; $$;

create function private.backend_heartbeat_media_processing(p_job uuid,p_token uuid,p_lease_seconds integer default 300) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_lease_seconds is null or p_lease_seconds not between 60 and 900 then return false; end if;
  update private.media_processing_jobs j set lease_until=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
  where j.id=p_job and j.lease_token=p_token and j.state='processing' and j.lease_until>now()
    and exists(select 1 from private.media_assets a join public.films f on f.id=j.draft_id
      where a.id=j.asset_id and a.owner_id=j.owner_id and a.status='uploaded'
        and a.object_key=j.source_key and a.etag=j.source_etag
        and f.owner_id=j.owner_id and f.film_asset_id=j.asset_id and f.status='draft'
        and private.profile_available(j.owner_id) and private.film_available(j.draft_id));
  return found;
end; $$;

create function private.backend_finish_media_processing(
  p_job uuid,p_token uuid,p_output_etag text,p_output_bytes bigint,p_sha256 text,
  p_width integer,p_height integer,p_duration numeric
) returns boolean language plpgsql security definer set search_path='' as $$
declare j private.media_processing_jobs; a private.media_assets;
begin
  select * into j from private.media_processing_jobs where id=p_job for update;
  if not found or j.state<>'processing' or j.lease_token is distinct from p_token or j.lease_until<=now()
    or p_output_etag is null or length(p_output_etag) not between 1 and 128
    or p_output_bytes is null or p_output_bytes<=0 or p_output_bytes>5368709120000
    or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
    or p_width is null or p_height is null or p_width<=0 or p_height<=0
    or greatest(p_width,p_height)>1920 or least(p_width,p_height)>1080
    or p_duration is null or p_duration<=0 or p_duration>86400 then return false; end if;
  select * into a from private.media_assets where id=j.asset_id and owner_id=j.owner_id for update;
  if not found or a.status<>'uploaded' or a.object_key<>j.source_key or a.etag<>j.source_etag
    or not private.profile_available(j.owner_id)
    or not exists(select 1 from public.films f where f.id=j.draft_id and f.owner_id=j.owner_id
      and f.film_asset_id=j.asset_id and f.status='draft' and private.film_available(f.id)) then return false; end if;
  update private.media_assets set object_key=j.output_key,expected_bytes=p_output_bytes,actual_bytes=p_output_bytes,
    etag=p_output_etag,width=p_width,height=p_height,duration_seconds=p_duration where id=a.id;
  update private.media_processing_jobs set state='complete',output_etag=p_output_etag,output_bytes=p_output_bytes,
    output_sha256=p_sha256,output_width=p_width,output_height=p_height,output_duration=p_duration,
    lease_token=null,lease_until=null,available_at=now(),last_error=null,updated_at=now() where id=j.id;
  return true;
end; $$;

create function private.backend_fail_media_processing(p_job uuid,p_token uuid,p_error text) returns boolean
language plpgsql security definer set search_path='' as $$
declare jid uuid; output text;
begin
  update private.media_processing_jobs set state=case when attempts>=5 then 'failed' else 'queued' end,
    available_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::integer),
    lease_token=null,lease_until=null,last_error=case when p_error in
      ('processing_failed','capacity','storage','source_changed','output_invalid','cancelled') then p_error else 'processing_failed' end,
    updated_at=now()
  where id=p_job and lease_token=p_token and state='processing' and lease_until>now()
  returning id,output_key into jid,output;
  if found and output is not null then
    insert into private.media_processing_cleanup(job_id,object_key,purpose,available_at)
      values(jid,output,'attempt',now()) on conflict(job_id,object_key) do nothing;
  end if;
  return found;
end; $$;

create function private.backend_retry_media_processing(p_asset uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.current_profile_id();
begin
  update private.media_processing_jobs j set state='queued',attempts=0,available_at=now(),last_error=null,
    lease_token=null,lease_until=null,updated_at=now()
  where j.asset_id=p_asset and j.owner_id=me and j.state='failed'
    and exists(select 1 from private.media_assets a join public.films f on f.id=j.draft_id
      where a.id=j.asset_id and a.status='uploaded' and a.object_key=j.source_key and a.etag=j.source_etag
        and f.status='draft' and f.owner_id=me and f.film_asset_id=p_asset)
    and private.profile_available(me) and private.film_available(j.draft_id);
  return found;
end; $$;

create function private.backend_media_processing_state(p_asset uuid,p_owner uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('state',j.state,'error',j.last_error,'updated_at',j.updated_at)
  from private.media_processing_jobs j where j.asset_id=p_asset and j.owner_id=p_owner;
$$;

create function private.backend_processing_output(p_job uuid,p_token uuid) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('output_key',output_key,'source_bytes',source_bytes)
  from private.media_processing_jobs where id=p_job and state='processing'
    and lease_token=p_token and lease_until>now();
$$;

-- Intercept film verification: the original is private and not ready to publish
-- until the processor has validated and recorded its replacement.
alter function public.backend_verify_asset(uuid,uuid,bigint,text,integer,integer,numeric) set schema private;
create function private.backend_verify_asset(p_id uuid,p_owner uuid,p_bytes bigint,p_etag text,p_width integer,p_height integer,p_duration numeric default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.media_assets;
begin
  select * into a from private.media_assets where id=p_id and owner_id=p_owner for update;
  if not found then raise exception 'Asset missing'; end if;
  if a.status in ('uploaded','ready') then return to_jsonb(a); end if;
  if a.status<>'pending' or a.expires_at<now() or a.expected_bytes<>p_bytes or p_etag is null or length(p_etag)>128 then
    raise exception 'Invalid upload'; end if;
  if a.kind='film' then
    update private.media_assets set status='uploaded',actual_bytes=p_bytes,etag=p_etag,
      width=null,height=null,duration_seconds=null where id=p_id returning * into a;
    perform private.enqueue_media_processing(a.id);
    return to_jsonb(a);
  end if;
  if p_width<=0 or p_height<=0 or p_width is null or p_height is null then raise exception 'Invalid dimensions'; end if;
  if a.kind='profile_picture' and (p_width>256 or p_height>256) then raise exception 'Profile picture exceeds 256px'; end if;
  if a.kind='poster' and (p_width>800 or p_height>1200) then raise exception 'Poster exceeds 800x1200'; end if;
  if a.kind='hook' and (p_duration is null or p_duration<=0 or p_duration>30 or greatest(p_width,p_height)>1280 or least(p_width,p_height)>720) then
    raise exception 'Hook exceeds 30 seconds or 720p'; end if;
  update private.media_assets set status='uploaded',actual_bytes=p_bytes,etag=p_etag,width=p_width,height=p_height,duration_seconds=p_duration
  where id=p_id returning * into a;
  return to_jsonb(a);
end; $$;
create function public.backend_verify_asset(p_id uuid,p_owner uuid,p_bytes bigint,p_etag text,p_width integer,p_height integer,p_duration numeric default null)
returns jsonb language sql security invoker set search_path='' as $$
  select private.backend_verify_asset(p_id,p_owner,p_bytes,p_etag,p_width,p_height,p_duration);
$$;

-- Multipart boundaries are persisted per session, so deployment does not
-- invalidate in-progress uploads. New parts start at 64 MiB and scale up only
-- as needed to keep each object within R2's 10,000-part ceiling.
create or replace function private.multipart_snapshot(p_owner uuid,p_asset uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('asset_id',a.id,'owner_id',m.owner_id,'draft_id',m.draft_id,
 'object_key',a.object_key,'bytes',a.expected_bytes,'fingerprint',m.fingerprint,'upload_id',m.upload_id,
 'status',m.status,'resume_expires_at',m.resume_expires_at,'op_token',m.op_token,'op_until',m.op_until,
 'last_signature_expires_at',m.last_signature_expires_at,
 'part_size',m.part_size,'part_count',ceil(a.expected_bytes::numeric/m.part_size)::integer,
 'asset_status',a.status,'public_key',a.public_key)
 from private.multipart_uploads m join private.media_assets a on a.id=m.asset_id
 where m.asset_id=p_asset and m.owner_id=p_owner and a.owner_id=p_owner; $$;

-- Extend the existing tested reservation function without replacing its locks,
-- idempotency rules, or unlimited-account accounting.
do $$ declare definition text; begin
  select pg_get_functiondef('private.backend_create_multipart(uuid,uuid,uuid,bigint,text)'::regprocedure) into definition;
  if position('declare lim bigint; used bigint; m private.multipart_uploads; a private.media_assets;' in definition)=0
    or position('p_bytes>2147483648' in definition)=0
    or position('insert into private.multipart_uploads(asset_id,owner_id,draft_id,request_id,fingerprint,resume_expires_at)' in definition)=0
    or position('values(a.id,p_owner,p_draft,p_request,p_fingerprint,a.expires_at)' in definition)=0 then
    raise exception 'Multipart reservation changed; review capacity migration'; end if;
  definition:=replace(definition,'declare lim bigint; used bigint; m private.multipart_uploads; a private.media_assets;',
    'declare lim bigint; used bigint; cap bigint; part_size bigint; m private.multipart_uploads; a private.media_assets;');
  definition:=replace(definition,'p_bytes>2147483648','p_bytes>5368709120000');
  definition:=replace(definition,'select quota_bytes into lim from private.user_state where user_id=p_owner for update;',
    'select max_source_bytes into cap from private.media_processor_capacity where id=true and heartbeat_at>now()-interval ''2 minutes'';'||chr(10)||
    ' if cap is null or p_bytes>cap then raise exception ''File exceeds available processing capacity; try a smaller export later'' using errcode=''54000''; end if;'||chr(10)||
    ' select quota_bytes into lim from private.user_state where user_id=p_owner for update;');
  definition:=replace(definition,
    'insert into private.multipart_uploads(asset_id,owner_id,draft_id,request_id,fingerprint,resume_expires_at)',
    'part_size:=greatest(67108864,ceil(p_bytes::numeric/10000/1048576)::bigint*1048576);'||chr(10)||
    ' insert into private.multipart_uploads(asset_id,owner_id,draft_id,request_id,fingerprint,resume_expires_at,part_size)');
  definition:=replace(definition,
    'values(a.id,p_owner,p_draft,p_request,p_fingerprint,a.expires_at)',
    'values(a.id,p_owner,p_draft,p_request,p_fingerprint,a.expires_at,part_size)');
  execute definition;
end $$;

-- Reclaimable by media-cleanup when the processor finished or a user removes a
-- draft. Incomplete upload sessions also expire through the existing R2 lifecycle.
create table private.media_processing_cleanup (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references private.media_processing_jobs(id) on delete cascade,
  object_key text not null,
  purpose text not null check (purpose in ('source','attempt')),
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  deleted_at timestamptz,
  unique(job_id,object_key)
);
alter table private.media_processing_cleanup enable row level security;
revoke all on private.media_processing_cleanup from public,anon,authenticated;
grant all on private.media_processing_cleanup to service_role;
create policy backend_only on private.media_processing_cleanup to service_role using (true) with check (true);

create function private.queue_processing_cleanup(p_job uuid,p_source text,p_output text,p_delay timestamptz default now()) returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into private.media_processing_cleanup(job_id,object_key,purpose,available_at)
  values(p_job,p_source,'source',greatest(now(),p_delay)) on conflict(job_id,object_key) do nothing;
  if p_output is not null then
    insert into private.media_processing_cleanup(job_id,object_key,purpose,available_at)
    values(p_job,p_output,'attempt',greatest(now(),p_delay)) on conflict(job_id,object_key) do nothing;
  end if;
end; $$;

create function private.cancel_media_processing_for_asset() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('deleting','quarantining','quarantined','rejected') and old.status is distinct from new.status then
    -- Preserve the old lease deadline before revoking it, so cleanup cannot
    -- delete an object while a worker still has a valid multipart writer.
    insert into private.media_processing_cleanup(job_id,object_key,purpose,available_at)
    select id,source_key,'source',greatest(now(),coalesce(lease_until,now()))
      from private.media_processing_jobs where asset_id=new.id
    on conflict(job_id,object_key) do nothing;
    insert into private.media_processing_cleanup(job_id,object_key,purpose,available_at)
    select id,output_key,'attempt',greatest(now(),coalesce(lease_until,now()))
      from private.media_processing_jobs where asset_id=new.id and output_key is not null and state<>'complete'
    on conflict(job_id,object_key) do nothing;
    update private.media_processing_jobs set state='cancelled',version=version+1,
      lease_token=null,lease_until=null,last_error='cancelled',updated_at=now()
    where asset_id=new.id and state in ('queued','processing','failed');
  end if;
  return new;
end; $$;
create trigger cancel_media_processing_for_asset after update of status on private.media_assets
  for each row execute function private.cancel_media_processing_for_asset();

create function private.backend_processing_cleanup_batch(p_limit integer default 10)
returns table(cleanup_id uuid,job_id uuid,object_key text,purpose text)
language plpgsql security definer set search_path='' as $$
begin
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid cleanup limit'; end if;
  return query update private.media_processing_cleanup c set lease_until=now()+interval '2 minutes'
    where c.id in (select q.id from private.media_processing_cleanup q where q.deleted_at is null
      and q.available_at<=now() and (q.lease_until is null or q.lease_until<now())
      order by q.available_at for update skip locked limit p_limit)
    returning c.id,c.job_id,c.object_key,c.purpose;
end; $$;
create function private.backend_mark_processing_object_deleted(p_cleanup uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update private.media_processing_cleanup set deleted_at=now(),lease_until=null where id=p_cleanup and deleted_at is null;
  update private.media_processing_jobs j set source_deleted=true,cleanup_lease_until=null,updated_at=now()
  where j.id=(select job_id from private.media_processing_cleanup where id=p_cleanup and purpose='source')
    and not exists(select 1 from private.media_processing_cleanup c where c.job_id=j.id and c.purpose='source' and c.deleted_at is null);
end; $$;

create function public.backend_processing_cleanup_batch(p_limit integer default 10)
returns table(cleanup_id uuid,job_id uuid,object_key text,purpose text)
language sql security invoker set search_path='' as $$ select * from private.backend_processing_cleanup_batch(p_limit); $$;
create function public.backend_mark_processing_object_deleted(p_cleanup uuid) returns void
language sql security invoker set search_path='' as $$ select private.backend_mark_processing_object_deleted(p_cleanup); $$;
create function public.backend_processing_output(p_job uuid,p_token uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.backend_processing_output(p_job,p_token); $$;
revoke all on function public.backend_processing_cleanup_batch(integer),public.backend_mark_processing_object_deleted(uuid) from public,anon,authenticated;
grant execute on function public.backend_processing_cleanup_batch(integer),public.backend_mark_processing_object_deleted(uuid) to service_role;
revoke all on function public.backend_processing_output(uuid,uuid) from public,anon,authenticated;
grant execute on function public.backend_processing_output(uuid,uuid) to service_role;

-- Upon successful CAS, retain the old source under a cleanup lease. Replacement
-- media is private at this point and only gets copied public by normal publish.
create or replace function private.backend_finish_media_processing(
  p_job uuid,p_token uuid,p_output_etag text,p_output_bytes bigint,p_sha256 text,
  p_width integer,p_height integer,p_duration numeric
) returns boolean language plpgsql security definer set search_path='' as $$
declare j private.media_processing_jobs; a private.media_assets;
begin
  select * into j from private.media_processing_jobs where id=p_job for update;
  if not found or j.state<>'processing' or j.lease_token is distinct from p_token or j.lease_until<=now()
    or p_output_etag is null or length(p_output_etag) not between 1 and 128
    or p_output_bytes is null or p_output_bytes<=0 or p_output_bytes>5497558138880
    or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
    or p_width is null or p_height is null or p_width<=0 or p_height<=0
    or greatest(p_width,p_height)>1920 or least(p_width,p_height)>1080
    or p_duration is null or p_duration<=0 or p_duration>86400 then return false; end if;
  select * into a from private.media_assets where id=j.asset_id and owner_id=j.owner_id for update;
  if not found or a.status<>'uploaded' or a.object_key<>j.source_key or a.etag<>j.source_etag
    or not private.profile_available(j.owner_id)
    or not exists(select 1 from public.films f where f.id=j.draft_id and f.owner_id=j.owner_id
      and f.film_asset_id=j.asset_id and f.status='draft' and private.film_available(f.id)) then return false; end if;
  update private.media_assets set object_key=j.output_key,expected_bytes=p_output_bytes,actual_bytes=p_output_bytes,
    etag=p_output_etag,width=p_width,height=p_height,duration_seconds=p_duration where id=a.id;
  update private.media_processing_jobs set state='complete',output_etag=p_output_etag,output_bytes=p_output_bytes,
    output_sha256=p_sha256,output_width=p_width,output_height=p_height,output_duration=p_duration,
    lease_token=null,lease_until=null,available_at=now(),last_error=null,updated_at=now() where id=j.id;
  insert into private.media_processing_cleanup(job_id,object_key,purpose,available_at)
    values(j.id,j.source_key,'source',now()) on conflict(job_id,object_key) do nothing;
  return true;
end; $$;

alter function public.backend_begin_promotion(uuid,uuid) set schema private;
create or replace function private.backend_begin_promotion(p_id uuid,p_owner uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare token uuid:=gen_random_uuid(); a private.media_assets;
begin
  select * into a from private.media_assets where id=p_id and owner_id=p_owner for update;
  if not found or a.status<>'uploaded' or a.etag is null or not private.profile_available(p_owner)
    or (a.kind='film' and not exists(select 1 from private.media_processing_jobs j where j.asset_id=a.id and j.state='complete'))
    or (a.promotion_until is not null and a.promotion_until>now())
    or exists(select 1 from public.films f join private.film_controls c on c.film_id=f.id and c.hidden where a.id in (f.film_asset_id,f.hook_asset_id,f.poster_asset_id)) then
    raise exception 'Asset not ready for publication; automatic processing must finish first' using errcode='55000'; end if;
  update private.media_assets set promotion_token=token,promotion_until=now()+interval '5 minutes' where id=p_id;
  return token;
end; $$;
create function public.backend_begin_promotion(p_id uuid,p_owner uuid) returns uuid
language sql security invoker set search_path='' as $$ select private.backend_begin_promotion(p_id,p_owner); $$;

create function private.set_media_processor_capacity(p_available bigint) returns bigint
language sql security invoker set search_path='' as $$ select private.backend_set_processor_capacity(p_available); $$;
create function private.claim_media_processing_job(p_lease_seconds integer default 300) returns jsonb
language sql security invoker set search_path='' as $$ select private.backend_claim_media_processing(p_lease_seconds); $$;
create function private.heartbeat_media_processing_job(p_job uuid,p_token uuid,p_lease_seconds integer default 300) returns boolean
language sql security invoker set search_path='' as $$ select private.backend_heartbeat_media_processing(p_job,p_token,p_lease_seconds); $$;
create function private.finish_media_processing_job(p_job uuid,p_token uuid,p_output_etag text,p_output_bytes bigint,p_sha256 text,p_width integer,p_height integer,p_duration numeric) returns boolean
language sql security invoker set search_path='' as $$ select private.backend_finish_media_processing(p_job,p_token,p_output_etag,p_output_bytes,p_sha256,p_width,p_height,p_duration); $$;
create function private.fail_media_processing_job(p_job uuid,p_token uuid,p_error text) returns boolean
language sql security invoker set search_path='' as $$ select private.backend_fail_media_processing(p_job,p_token,p_error); $$;
create function private.retry_media_processing(p_asset uuid) returns boolean
language sql security invoker set search_path='' as $$ select private.backend_retry_media_processing(p_asset); $$;
create function private.get_media_processing_state(p_asset uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.backend_media_processing_state(p_asset,private.current_profile_id()); $$;

create function public.set_media_processor_capacity(p_available bigint) returns bigint language sql security invoker set search_path='' as $$ select private.set_media_processor_capacity(p_available); $$;
create function public.claim_media_processing_job(p_lease_seconds integer default 300) returns jsonb language sql security invoker set search_path='' as $$ select private.claim_media_processing_job(p_lease_seconds); $$;
create function public.heartbeat_media_processing_job(p_job uuid,p_token uuid,p_lease_seconds integer default 300) returns boolean language sql security invoker set search_path='' as $$ select private.heartbeat_media_processing_job(p_job,p_token,p_lease_seconds); $$;
create function public.finish_media_processing_job(p_job uuid,p_token uuid,p_output_etag text,p_output_bytes bigint,p_sha256 text,p_width integer,p_height integer,p_duration numeric) returns boolean language sql security invoker set search_path='' as $$ select private.finish_media_processing_job(p_job,p_token,p_output_etag,p_output_bytes,p_sha256,p_width,p_height,p_duration); $$;
create function public.fail_media_processing_job(p_job uuid,p_token uuid,p_error text) returns boolean language sql security invoker set search_path='' as $$ select private.fail_media_processing_job(p_job,p_token,p_error); $$;
create function public.retry_media_processing(p_asset uuid) returns boolean language sql security invoker set search_path='' as $$ select private.retry_media_processing(p_asset); $$;
create function public.get_media_processing_state(p_asset uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.get_media_processing_state(p_asset); $$;

-- Only the authenticated owner can inspect or retry the job for their asset.
revoke all on function public.retry_media_processing(uuid),public.get_media_processing_state(uuid) from public,anon;
grant execute on function public.retry_media_processing(uuid),public.get_media_processing_state(uuid) to authenticated,service_role;
-- Operational RPC wrappers are callable only by service_role. The endpoint adds
-- a separate shared secret, and never exposes a privileged DB credential to VM.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.proname in ('set_media_processor_capacity','claim_media_processing_job','heartbeat_media_processing_job',
      'finish_media_processing_job','fail_media_processing_job') and n.nspname in ('private','public') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.sig);
    execute format('grant execute on function %s to service_role',f.sig);
  end loop;
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname in ('enqueue_media_processing','backend_set_processor_capacity',
      'backend_claim_media_processing','backend_heartbeat_media_processing','backend_finish_media_processing',
      'backend_fail_media_processing','backend_retry_media_processing','backend_media_processing_state',
      'backend_processing_cleanup_batch','backend_mark_processing_object_deleted','backend_processing_output','queue_processing_cleanup',
      'cancel_media_processing_for_asset','backend_verify_asset','backend_begin_promotion',
      'set_media_processor_capacity','claim_media_processing_job','heartbeat_media_processing_job',
      'finish_media_processing_job','fail_media_processing_job','retry_media_processing','get_media_processing_state') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.sig);
    execute format('grant execute on function %s to service_role',f.sig);
  end loop;
  execute 'grant execute on function private.retry_media_processing(uuid),private.get_media_processing_state(uuid) to authenticated,service_role';
  execute 'revoke all on function public.backend_verify_asset(uuid,uuid,bigint,text,integer,integer,numeric) from public,anon,authenticated';
  execute 'grant execute on function public.backend_verify_asset(uuid,uuid,bigint,text,integer,integer,numeric) to service_role';
  execute 'revoke all on function public.backend_begin_promotion(uuid,uuid) from public,anon,authenticated';
  execute 'grant execute on function public.backend_begin_promotion(uuid,uuid) to service_role';
end $$;

-- Keep cleanup before account-deletion completion so original private bytes are
-- removed before the owner's rows disappear.
do $$ declare definition text; begin
  select pg_get_functiondef('private.backend_finish_account_deletion(uuid)'::regprocedure) into definition;
  if position('if not j.clerk_deleted or exists(select 1 from private.media_jobs' in definition)=0 then
    raise exception 'Account deletion cleanup gate changed; review media processing integration'; end if;
  definition:=replace(definition,'if not j.clerk_deleted or exists(select 1 from private.media_jobs',
    'if not j.clerk_deleted or exists(select 1 from private.media_processing_cleanup c join private.media_processing_jobs x on x.id=c.job_id where x.owner_id=j.profile_id and c.deleted_at is null) or exists(select 1 from private.media_processing_jobs x where x.owner_id=j.profile_id and x.state in (''queued'',''processing'',''failed'')) or exists(select 1 from private.media_jobs');
  execute definition;
end $$;

comment on table private.media_processing_jobs is 'Private durable queue for validated server-side 1080p MP4 conversion; source media stays private until successful completion.';
comment on table private.media_processor_capacity is 'Latest authenticated processor scratch capacity used to avoid accepting jobs larger than the host can process.';
