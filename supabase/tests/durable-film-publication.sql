-- Disposable fixtures; always roll back. Also runnable against the isolated fixture harness.
begin;
insert into auth.users(id,email) values
 ('65000000-0000-4000-8000-000000000001','publication-a@example.invalid'),
 ('65000000-0000-4000-8000-000000000002','publication-b@example.invalid');
update public.profiles set full_name='Publication fixture',roles=array['Director'],onboarding_completed=true
 where id in ('65000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000002');
insert into private.media_assets(id,owner_id,kind,object_key,expected_bytes,actual_bytes,etag,content_type,status,expires_at)
values('65000000-0000-4000-8000-000000000003','65000000-0000-4000-8000-000000000001','film',
 '65000000-0000-4000-8000-000000000001/65000000-0000-4000-8000-000000000003',100,100,'source','video/mp4','uploaded',now()+interval '1 day');
insert into public.films(id,owner_id,title,source,film_asset_id) values
 ('65000000-0000-4000-8000-000000000004','65000000-0000-4000-8000-000000000001','Publication fixture','r2_native','65000000-0000-4000-8000-000000000003');
insert into private.media_processing_jobs(asset_id,owner_id,draft_id,source_key,source_etag,source_bytes,state)
 values('65000000-0000-4000-8000-000000000003','65000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000004','fixture-source','source',100,'processing');

select set_config('request.jwt.claims','{"sub":"65000000-0000-4000-8000-000000000002","iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1"}',true);
set local role authenticated;
do $$ begin
 if public.get_film_publication('65000000-0000-4000-8000-000000000004') is not null then raise exception 'Cross-owner read'; end if;
 begin
   perform public.set_film_publication('65000000-0000-4000-8000-000000000004',true);
   raise exception 'Cross-owner request';
 exception when insufficient_privilege then null; end;
 begin
   perform public.backend_claim_film_publication();
   raise exception 'Client claimed service work';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"65000000-0000-4000-8000-000000000001","iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1"}',true);
set local role authenticated;
select public.set_film_publication('65000000-0000-4000-8000-000000000004',true);
reset role;
do $$ declare job jsonb; tok uuid; begin
 -- No browser/session callback is involved in claiming or finishing.
 if private.backend_claim_film_publication() is not null then raise exception 'Claimed unfinished encode'; end if;
 update private.media_processing_jobs set state='complete' where asset_id='65000000-0000-4000-8000-000000000003';
 job:=private.backend_claim_film_publication(); tok:=(job->>'token')::uuid;
 if tok is null then raise exception 'Completed encode not claimed'; end if;
 if private.backend_finish_film_publication('65000000-0000-4000-8000-000000000004',tok) then raise exception 'Published before R2 promotion'; end if;
 update private.media_assets set status='ready',public_key='assets/65000000-0000-4000-8000-000000000003',duration_seconds=1
 where id='65000000-0000-4000-8000-000000000003';
 if private.backend_finish_film_publication('65000000-0000-4000-8000-000000000004',gen_random_uuid()) then raise exception 'Accepted stale lease'; end if;
 if not private.backend_finish_film_publication('65000000-0000-4000-8000-000000000004',tok) then raise exception 'Publication failed'; end if;
 if not private.backend_finish_film_publication('65000000-0000-4000-8000-000000000004',tok) then raise exception 'Lost response not recoverable'; end if;
 if (select state from private.film_publication_requests where film_id='65000000-0000-4000-8000-000000000004')<>'complete' then raise exception 'Request not completed'; end if;
 update public.films set status='draft' where id='65000000-0000-4000-8000-000000000004';
 perform private.set_film_publication('65000000-0000-4000-8000-000000000004',true);
 job:=private.backend_claim_film_publication(); tok:=(job->>'token')::uuid;
 perform private.set_film_publication('65000000-0000-4000-8000-000000000004',false);
 if private.backend_finish_film_publication('65000000-0000-4000-8000-000000000004',tok) then raise exception 'Published after cancellation'; end if;
 perform private.set_film_publication('65000000-0000-4000-8000-000000000004',true);
 job:=private.backend_claim_film_publication(); tok:=(job->>'token')::uuid;
 update public.films set title='Changed details' where id='65000000-0000-4000-8000-000000000004';
 if private.backend_finish_film_publication('65000000-0000-4000-8000-000000000004',tok) then raise exception 'Published changed draft'; end if;
 perform private.set_film_publication('65000000-0000-4000-8000-000000000004',true);
 job:=private.backend_claim_film_publication(); tok:=(job->>'token')::uuid;
 perform private.backend_retry_film_publication('65000000-0000-4000-8000-000000000004',tok);
 if private.backend_claim_film_publication() is not null then raise exception 'Retry backoff ignored'; end if;
end $$;
set local role anon;
do $$ begin
 begin
 perform public.set_film_publication('65000000-0000-4000-8000-000000000004',true);
 raise exception 'Anonymous scheduled publication';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'Durable publication, cancellation, recovery and access-control assertions passed; fixtures rolled back' as result;
