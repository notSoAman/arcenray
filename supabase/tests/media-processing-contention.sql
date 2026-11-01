begin;
create temporary table queue_fixtures(n integer, owner_id uuid, asset_id uuid, film_id uuid, job_id uuid);
do $$ declare i integer; actor uuid; film uuid; asset uuid; job uuid; begin
 for i in 1..4 loop
   actor:=gen_random_uuid(); film:=gen_random_uuid(); asset:=gen_random_uuid(); job:=gen_random_uuid();
   insert into auth.users(id,email) values(actor,'queue-test-'||actor||'@example.invalid');
   insert into private.media_assets(id,owner_id,kind,object_key,expected_bytes,actual_bytes,etag,content_type,status,expires_at)
     values(asset,actor,'film','fixture/'||asset,100,100,'source','video/mp4','uploaded',now()+interval '1 hour');
   insert into public.films(id,owner_id,title,film_asset_id) values(film,actor,'Queue contention fixture',asset);
   insert into private.media_processing_jobs(id,asset_id,owner_id,draft_id,source_key,source_etag,source_bytes,created_at)
     values(job,asset,actor,film,'fixture/'||asset,'source',100,now()-make_interval(secs=>5-i));
   insert into queue_fixtures values(i,actor,asset,film,job);
 end loop;
 perform private.backend_set_processor_capacity(80000000000);
end $$;

do $$ declare first_job jsonb; next_job jsonb; reclaimed jsonb; token uuid; begin
 first_job:=private.backend_claim_media_processing_job();
 if first_job->>'job_id' is distinct from (select job_id::text from queue_fixtures where n=1) then raise exception 'FAIL: oldest upload not claimed'; end if;
 -- Overlapping dispatch calls must not start a second encode on this single processor.
 for i in 1..8 loop
   if private.backend_claim_media_processing_job() is not null then raise exception 'FAIL: processor oversubscribed by concurrent poll'; end if;
 end loop;
 perform private.backend_fail_media_processing_job((first_job->>'job_id')::uuid,(first_job->>'lease_token')::uuid,'storage');
 next_job:=private.backend_claim_media_processing_job();
 if next_job->>'job_id' is distinct from (select job_id::text from queue_fixtures where n=2) then raise exception 'FAIL: retry backoff blocked next creator'; end if;
 update private.media_processing_jobs set lease_until=now()-interval '1 second' where id=(next_job->>'job_id')::uuid;
 reclaimed:=private.backend_claim_media_processing_job();
 if reclaimed->>'job_id' is distinct from next_job->>'job_id' or reclaimed->>'lease_token'=next_job->>'lease_token' then raise exception 'FAIL: expired lease not safely reclaimed'; end if;
 if not exists(select 1 from private.media_processing_cleanup where object_key=next_job->>'output_key') then raise exception 'FAIL: abandoned attempt leaked'; end if;
 if private.backend_heartbeat_media_processing_job((next_job->>'job_id')::uuid,(next_job->>'lease_token')::uuid) then raise exception 'FAIL: stale worker retained authority'; end if;
 update private.media_processing_jobs set lease_until=now()-interval '1 second',attempts=5 where id=(reclaimed->>'job_id')::uuid;
 next_job:=private.backend_claim_media_processing_job();
 if next_job->>'job_id' is distinct from (select job_id::text from queue_fixtures where n=3) then raise exception 'FAIL: repeated crash blocked next creator'; end if;
 if not exists(select 1 from private.media_processing_jobs where id=(reclaimed->>'job_id')::uuid and state='failed' and lease_token is null) then raise exception 'FAIL: repeated crashes never terminate'; end if;
end $$;
rollback;
select 'Media contention, lease recovery, fairness and bounded retry assertions passed; fixtures rolled back' as result;
