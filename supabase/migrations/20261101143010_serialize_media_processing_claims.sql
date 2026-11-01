create or replace function private.backend_claim_media_processing_job(p_lease_seconds integer default 300) returns jsonb
language plpgsql security definer set search_path='' as $$ declare j private.media_processing_jobs; c private.media_processor_capacity; tok uuid; att uuid; begin
 if p_lease_seconds is null or p_lease_seconds not between 60 and 900 then raise exception 'Invalid lease'; end if;
 -- This capacity record describes one two-core processor. Serialize dispatch
 -- across overlapping polls/restarts; uploading and publication remain parallel.
 perform pg_advisory_xact_lock(hashtextextended('arcenray-processing-dispatch',0));
 -- A worker crash must not silently grant unbounded re-encodes or leak attempts.
 insert into private.media_processing_cleanup(job_id,object_key,purpose)
 select id,output_key,'attempt' from private.media_processing_jobs
 where state='processing' and lease_until<=now() and output_key is not null
 on conflict do nothing;
 update private.media_processing_jobs set state='failed',last_error='processing_failed',
   stage=null,lease_token=null,lease_until=null,updated_at=now()
 where state='processing' and lease_until<=now() and attempts>=5;
 if exists(select 1 from private.media_processing_jobs where state='processing' and lease_until>now()) then return null; end if;
 select * into c from private.media_processor_capacity where id=true;
 if not found or c.heartbeat_at<now()-interval '2 minutes' then return null; end if;
 select q.* into j from private.media_processing_jobs q join private.media_assets a on a.id=q.asset_id and a.owner_id=q.owner_id
 join public.films f on f.id=q.draft_id and f.owner_id=q.owner_id and f.film_asset_id=q.asset_id and f.status='draft'
 where ((q.state='queued' and q.available_at<=now()) or (q.state='processing' and q.lease_until<now()))
 and q.source_bytes<=c.max_source_bytes and a.status='uploaded' and a.object_key=q.source_key and a.etag=q.source_etag
 and private.profile_available(q.owner_id) and private.film_available(q.draft_id)
 order by q.available_at,q.created_at for update of q skip locked limit 1;
 if not found then return null; end if;
 tok:=gen_random_uuid(); att:=gen_random_uuid();
 update private.media_processing_jobs set state='processing',version=version+1,attempts=attempts+1,
 lease_token=tok,lease_until=now()+make_interval(secs=>p_lease_seconds),attempt_id=att,stage=null,last_error=null,
 output_key='processing/'||id::text||'/'||att::text||'/film.mp4',output_etag=null,output_bytes=null,output_sha256=null,
 output_width=null,output_height=null,output_duration=null,updated_at=now() where id=j.id returning * into j;
 return jsonb_build_object('job_id',j.id,'asset_id',j.asset_id,'owner_id',j.owner_id,'draft_id',j.draft_id,
 'source_key',j.source_key,'source_etag',j.source_etag,'source_bytes',j.source_bytes,'policy_version','1080p-v1',
 'version',j.version,'lease_token',j.lease_token,'lease_until',j.lease_until,'attempt_id',j.attempt_id,'output_key',j.output_key);
end; $$;
