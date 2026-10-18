begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end; $$;
create function pg_temp.denied(sql text) returns void language plpgsql as $$ begin
 begin execute sql; exception when insufficient_privilege or check_violation or raise_exception or object_not_in_prerequisite_state then return; end;
 raise exception 'FAIL: expected denial'; end; $$;
insert into private.identity_providers(issuer,provider) values('https://race-fixture.accounts.dev','clerk');
select set_config('request.jwt.claims','{"iss":"https://race-fixture.accounts.dev","sub":"user_raceFounder","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.founder',public.ensure_current_profile()::text,true);
reset role;
insert into private.founder_moderators values(current_setting('test.founder')::uuid);
select set_config('request.jwt.claims','{"iss":"https://race-fixture.accounts.dev","sub":"user_raceOwner","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.owner',public.ensure_current_profile()::text,true);
update public.profiles set full_name='Race fixture',roles=array['director'],onboarding_completed=true where id=private.current_profile_id();
select public.set_onboarding_preferences(array['dreamlike','intimate','kinetic']);
reset role;
insert into private.media_assets(id,owner_id,kind,object_key,expected_bytes,actual_bytes,content_type,status,etag) values
('49000000-0000-0000-0000-000000000001',current_setting('test.owner')::uuid,'hook',current_setting('test.owner')||'/49000000-0000-0000-0000-000000000002',100,100,'video/mp4','uploaded','"abc123"');
insert into public.films(id,owner_id,title,hook_asset_id,mood_tags) values
('49000000-0000-0000-0000-000000000003',current_setting('test.owner')::uuid,'Matching mood','49000000-0000-0000-0000-000000000001',array['Dreamlike']);
insert into public.films(id,owner_id,title,mood_tags) values
('49000000-0000-0000-0000-000000000004',current_setting('test.owner')::uuid,'Other mood',array['Tense']);
set local role authenticated;
select pg_temp.assert_true(private.onboarding_affinity('49000000-0000-0000-0000-000000000003')>private.onboarding_affinity('49000000-0000-0000-0000-000000000004'),'own choices seed label fallback');
reset role;
set local role service_role;
select set_config('test.promotion',public.backend_begin_promotion('49000000-0000-0000-0000-000000000001',current_setting('test.owner')::uuid)::text,true);
reset role;
select set_config('request.jwt.claims','{"iss":"https://race-fixture.accounts.dev","sub":"user_raceFounder","role":"authenticated"}',true);
set local role authenticated;
select public.moderate_profile(current_setting('test.owner')::uuid,true,'Fixture suspension during copy');
select pg_temp.denied(format('select public.open_conversation(%L)',current_setting('test.owner')));
reset role;
select pg_temp.assert_true((select action='quarantine' and available_at>now()+interval '9 minutes' from private.media_jobs where asset_id='49000000-0000-0000-0000-000000000001'),'inflight draft publication quarantined after lease');
set local role service_role;
select pg_temp.denied(format('select public.backend_finish_promotion(''49000000-0000-0000-0000-000000000001'',%L,%L)',current_setting('test.owner'),current_setting('test.promotion')));
reset role;
-- Terminal assets cannot acquire new references, even if owned.
update private.media_assets set status='deleting' where id='49000000-0000-0000-0000-000000000001';
select pg_temp.denied(format('insert into public.films(owner_id,title,hook_asset_id) values(%L,''Late attachment'',''49000000-0000-0000-0000-000000000001'')',current_setting('test.owner')));
-- Three completed-provider jobs with incomplete media must not block a fourth.
insert into private.account_deletion_jobs(profile_id,issuer,subject,clerk_deleted,available_at)
select gen_random_uuid(),'https://race-fixture.accounts.dev','user_stuck'||n,true,now()-interval '100 years' from generate_series(1,3) n;
insert into private.media_jobs(asset_id,owner_id,object_key,public_key,content_type,bytes,action,private_delete_after)
select gen_random_uuid(),profile_id,profile_id||'/'||gen_random_uuid(), 'assets/'||gen_random_uuid(),'video/mp4',100,'delete',now() from private.account_deletion_jobs where subject like 'user_stuck%';
insert into private.account_deletion_jobs(profile_id,issuer,subject,clerk_deleted,available_at) values(gen_random_uuid(),'https://race-fixture.accounts.dev','user_actionable',false,now()-interval '99 years');
select pg_temp.assert_true(exists(select 1 from public.backend_pending_account_deletions() where subject='user_actionable'),'actionable account not starved');
select public.backend_defer_account_deletion(id) from private.account_deletion_jobs where subject='user_actionable';
select pg_temp.assert_true(not exists(select 1 from public.backend_pending_account_deletions() where subject='user_actionable'),'failed provider call backs off');
-- Founder self-service remains guarded; an external deletion already happened and
-- must revoke old tokens instead of retrying a permanently impossible safeguard.
set local role service_role;
select pg_temp.denied(format('select public.backend_begin_account_deletion(''https://race-fixture.accounts.dev'',''user_raceFounder'',false,%L)',current_setting('test.founder')));
select pg_temp.assert_true(public.backend_begin_account_deletion('https://race-fixture.accounts.dev','user_raceFounder',true) is not null,'already deleted founder revoked durably');
reset role;
select pg_temp.assert_true(private.current_profile_id() is null,'externally deleted founder token revoked');
-- Derived information cannot outlive deleted sources.
insert into private.entity_embeddings(kind,entity_id,embedding,content_hash) values('film','49000000-0000-0000-0000-000000000004',array_fill(.01::real,array[384])::extensions.vector,'fixture');
insert into private.moderation_audit(actor,target_id,action,reason) values(current_setting('test.owner')::uuid,'49000000-0000-0000-0000-000000000004','fixture','Disposable test reason');
delete from public.films where id='49000000-0000-0000-0000-000000000004';
select pg_temp.assert_true(not exists(select 1 from private.entity_embeddings where entity_id='49000000-0000-0000-0000-000000000004'),'deleted film embedding removed');
select pg_temp.assert_true(not exists(select 1 from private.moderation_audit where target_id='49000000-0000-0000-0000-000000000004'),'deleted film audit source removed');
rollback;
select 'Lifecycle race, queue fairness, derived data and cold-start assertions passed; fixtures rolled back' as result;
