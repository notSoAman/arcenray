-- Preserve existing upload/publication gates. Processing stages are informational;
-- only independently verified completion can promote an asset.
alter table private.media_processing_jobs add column stage text
  check (stage in ('downloading','encoding','checking','uploading'));
alter table private.media_processing_jobs drop constraint media_processing_jobs_last_error_check;
alter table private.media_processing_jobs add constraint media_processing_jobs_last_error_check
  check (last_error in ('processing_failed','capacity','storage','source_changed','output_invalid','cancelled',
    'multiple_tracks','hdr_unsupported','unsupported_media','invalid_media','processing_timeout'));

create function private.backend_heartbeat_media_processing_progress(p_job uuid,p_token uuid,p_stage text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_stage is null or p_stage not in ('downloading','encoding','checking','uploading') then
    raise exception 'Invalid processing stage' using errcode='22023';
  end if;
  if not private.backend_heartbeat_media_processing_job(p_job,p_token,300) then return false; end if;
  update private.media_processing_jobs set stage=p_stage where id=p_job;
  return true;
end; $$;
create function public.backend_heartbeat_media_processing_progress(p_job uuid,p_token uuid,p_stage text)
returns boolean language sql security invoker set search_path='' as $$
  select private.backend_heartbeat_media_processing_progress(p_job,p_token,p_stage);
$$;
revoke all on function private.backend_heartbeat_media_processing_progress(uuid,uuid,text),
 public.backend_heartbeat_media_processing_progress(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.backend_heartbeat_media_processing_progress(uuid,uuid,text),
 public.backend_heartbeat_media_processing_progress(uuid,uuid,text) to service_role;

create or replace function private.backend_fail_media_processing_job(p_job uuid,p_token uuid,p_error text)
returns boolean language plpgsql security definer set search_path='' as $$
declare j private.media_processing_jobs; ok boolean; safe_error text;
begin
  safe_error:=case when p_error in ('processing_failed','capacity','storage','source_changed','output_invalid','cancelled',
    'multiple_tracks','hdr_unsupported','unsupported_media','invalid_media','processing_timeout')
    then p_error else 'processing_failed' end;
  update private.media_processing_jobs set
    state=case when attempts>=5 or safe_error in ('source_changed','multiple_tracks','hdr_unsupported',
      'unsupported_media','invalid_media','processing_timeout') then 'failed' else 'queued' end,
    available_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::integer),
    lease_token=null,lease_until=null,stage=null,last_error=safe_error,updated_at=now()
    where id=p_job and lease_token=p_token and state='processing' and lease_until>now() returning * into j;
  ok:=found;
  if ok and j.output_key is not null then
    insert into private.media_processing_cleanup(job_id,object_key,purpose)
    values(j.id,j.output_key,'attempt') on conflict do nothing;
  end if;
  return ok;
end; $$;

-- A lost completion response must be recoverable without re-encoding the film.
-- This RPC is service-only; the endpoint also compares the exact output receipt.
create or replace function private.backend_processing_output(p_job uuid,p_token uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('output_key',output_key,'source_bytes',source_bytes,'completed',state='complete',
    'output_etag',output_etag,'output_bytes',output_bytes,'sha256',output_sha256)
  from private.media_processing_jobs where id=p_job
    and ((state='processing' and lease_token=p_token and lease_until>now()) or state='complete');
$$;

create or replace function private.backend_media_processing_state(p_asset uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('state',state,'error',last_error,'updated_at',updated_at,
    'stage',case when state='processing' then stage else null end)
  from private.media_processing_jobs where asset_id=p_asset and owner_id=private.current_profile_id();
$$;
