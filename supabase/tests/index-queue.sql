-- Prepared for the reviewed durable-index migration. All state changes roll back.
begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',message;end if;end; $$;
create function pg_temp.expect_denied(statement text) returns void language plpgsql as $$ begin
 begin execute statement;exception when insufficient_privilege then return;end;
 raise exception 'FAIL expected denial: %',statement;end; $$;
create function pg_temp.expect_invalid(statement text) returns void language plpgsql as $$ begin
 begin execute statement;exception when invalid_parameter_value or raise_exception then return;end;
 raise exception 'FAIL expected rejection: %',statement;end; $$;
-- Isolate a populated queue transactionally; no real work or inference is run.
update private.index_jobs set available_at=now()+interval '1 day',state='pending',lease_until=null where state<>'cancelled';
insert into auth.users(id,email) values
('1a000000-0000-0000-0000-000000000001','index-owner-'||gen_random_uuid()||'@example.invalid'),
('1a000000-0000-0000-0000-000000000002','index-peer-'||gen_random_uuid()||'@example.invalid');
update public.profiles set full_name='Queue owner',roles=array['director'],onboarding_completed=true where id='1a000000-0000-0000-0000-000000000001';
insert into public.films(id,owner_id,title,status) values
('2a000000-0000-0000-0000-000000000001','1a000000-0000-0000-0000-000000000001','Queue public A','published'),
('2a000000-0000-0000-0000-000000000002','1a000000-0000-0000-0000-000000000001','Queue public B','published'),
('2a000000-0000-0000-0000-000000000003','1a000000-0000-0000-0000-000000000001','Queue private draft','draft');
select pg_temp.assert_true((select count(*)=3 from private.index_jobs where owner_id='1a000000-0000-0000-0000-000000000001'),'public films and completed profile queued, draft excluded');
select pg_temp.assert_true(not exists(select 1 from private.index_jobs where entity_id='1a000000-0000-0000-0000-000000000002'),'pending profile excluded');
create temp table index_claims as select * from public.backend_claim_index_jobs(3) with no data;
grant all on index_claims to service_role;
set local role service_role;
insert into index_claims select * from public.backend_claim_index_jobs(3);
reset role;
select pg_temp.assert_true((select count(*)=3 from index_claims),'service claims bounded batch');
select pg_temp.assert_true(not exists(select 1 from index_claims where entity_id='2a000000-0000-0000-0000-000000000003'),'no draft content in worker payload');
select pg_temp.assert_true((select count(*)=0 from public.backend_claim_index_jobs(3)),'leased rows not claimed twice');
select pg_temp.expect_invalid('select public.backend_claim_index_jobs(4)');
select pg_temp.expect_invalid('select public.backend_claim_index_jobs(null)');
select pg_temp.expect_invalid($q$select public.backend_finish_index_job('film','2a000000-0000-0000-0000-000000000001',1,null)$q$);

select pg_temp.assert_true(public.backend_set_embedding('film','2a000000-0000-0000-0000-000000000001','1a000000-0000-0000-0000-000000000001',array_fill(.1::real,array[384])::extensions.vector,
 (select content_hash from private.index_jobs where kind='film' and entity_id='2a000000-0000-0000-0000-000000000001'),
 (select source_updated_at from index_claims where kind='film' and entity_id='2a000000-0000-0000-0000-000000000001')),'source CAS accepts current vector');
select pg_temp.assert_true(public.backend_finish_index_job('film','2a000000-0000-0000-0000-000000000001',
 (select version from index_claims where kind='film' and entity_id='2a000000-0000-0000-0000-000000000001'),true),'versioned completion acknowledged');
select private.enqueue_index('film','2a000000-0000-0000-0000-000000000001');
select pg_temp.assert_true(not exists(select 1 from private.index_jobs where kind='film' and entity_id='2a000000-0000-0000-0000-000000000001'),'fresh exact-content embedding skips extra work');
update public.films set title='Queue changed source' where id='2a000000-0000-0000-0000-000000000002';
select pg_temp.assert_true(not public.backend_finish_index_job('film','2a000000-0000-0000-0000-000000000002',
 (select version from index_claims where kind='film' and entity_id='2a000000-0000-0000-0000-000000000002'),true),'old job cannot complete new metadata');
insert into index_claims select * from public.backend_claim_index_jobs(3);
insert into private.film_controls(film_id,hidden,reason) values('2a000000-0000-0000-0000-000000000002',true,'Index queue isolation');
select pg_temp.assert_true((select state='cancelled' from private.index_jobs where kind='film' and entity_id='2a000000-0000-0000-0000-000000000002'),'takedown cancels inference work');
-- Model work already in flight may complete after control invalidation. Legacy
-- owner-index compatibility is retained; queue completion removes only its hash.
select public.backend_set_embedding('film','2a000000-0000-0000-0000-000000000002','1a000000-0000-0000-0000-000000000001',array_fill(.1::real,array[384])::extensions.vector,
 (select content_hash from private.index_jobs where kind='film' and entity_id='2a000000-0000-0000-0000-000000000002'),
 (select max(source_updated_at) from index_claims where kind='film' and entity_id='2a000000-0000-0000-0000-000000000002'));
select pg_temp.assert_true(not public.backend_finish_index_job('film','2a000000-0000-0000-0000-000000000002',
 (select max(version) from index_claims where kind='film' and entity_id='2a000000-0000-0000-0000-000000000002'),true),'inactive completion never claims success');
select pg_temp.assert_true(not exists(select 1 from private.entity_embeddings where kind='film' and entity_id='2a000000-0000-0000-0000-000000000002'),'late cancelled vector removed');
update private.film_controls set hidden=false where film_id='2a000000-0000-0000-0000-000000000002';
select pg_temp.assert_true((select version>(select max(version) from index_claims where kind='film' and entity_id='2a000000-0000-0000-0000-000000000002') from private.index_jobs where kind='film' and entity_id='2a000000-0000-0000-0000-000000000002'),'recreated job version cannot reuse old lease token');
insert into index_claims select * from public.backend_claim_index_jobs(3);
select public.backend_finish_index_job('film','2a000000-0000-0000-0000-000000000002',
 (select max(version) from index_claims where kind='film' and entity_id='2a000000-0000-0000-0000-000000000002'),false);
select pg_temp.assert_true((select state='pending' and available_at>now() from private.index_jobs where kind='film' and entity_id='2a000000-0000-0000-0000-000000000002'),'model failure retains retry with backoff');
update private.index_jobs set state='processing',lease_until=now()-interval '1 second' where kind='film' and entity_id='2a000000-0000-0000-0000-000000000002';
insert into index_claims select * from public.backend_claim_index_jobs(3);
select pg_temp.assert_true((select count(distinct version)>=3 from index_claims where kind='film' and entity_id='2a000000-0000-0000-0000-000000000002'),'expired lease gets a new compare-and-set token');

insert into public.film_credits(id,film_id,profile_id,display_name,role) values('3a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000001','1a000000-0000-0000-0000-000000000002','Queue peer','editor');
select pg_temp.assert_true(exists(select 1 from private.index_jobs where kind='film' and entity_id='2a000000-0000-0000-0000-000000000001'),'listed credit queues film');
select pg_temp.assert_true(not exists(select 1 from private.entity_embeddings where kind='film' and entity_id='2a000000-0000-0000-0000-000000000001'),'listed credit invalidates vector transactionally');
select pg_temp.assert_true((select content like '%Queue peer: editor%' from private.index_source('film','2a000000-0000-0000-0000-000000000001')),'listed credit enters film index source without confirmation');
update public.profiles set full_name='Queue peer',roles=array['editor'],onboarding_completed=true where id='1a000000-0000-0000-0000-000000000002';
select pg_temp.assert_true(exists(select 1 from private.index_jobs where kind='profile' and entity_id='1a000000-0000-0000-0000-000000000002'),'onboarding queues profile');
update public.films set status='published',synopsis=repeat('x',5000),genres=array[repeat('g',2000)] where id='2a000000-0000-0000-0000-000000000003';
select pg_temp.assert_true((select char_length(content)=6000 from private.index_source('film','2a000000-0000-0000-0000-000000000003')),'publication content bounded to 6000 characters');
insert into private.profile_controls(profile_id,status) values('1a000000-0000-0000-0000-000000000001','suspended');
select pg_temp.assert_true(not exists(select 1 from private.index_jobs where owner_id='1a000000-0000-0000-0000-000000000001' and state<>'cancelled'),'suspension excludes owner work');
select pg_temp.assert_true((select count(*)=0 from private.index_source('film','2a000000-0000-0000-0000-000000000001')),'inactive content cannot be read for worker');
delete from public.films where id='2a000000-0000-0000-0000-000000000001';
select pg_temp.assert_true(not exists(select 1 from private.index_jobs where entity_id='2a000000-0000-0000-0000-000000000001'),'source deletion cleans job');

set local role anon;
select pg_temp.expect_denied('select public.backend_claim_index_jobs(3)');
select pg_temp.expect_denied($q$select public.backend_finish_index_job('film','2a000000-0000-0000-0000-000000000001',1,true)$q$);
select pg_temp.expect_denied('select * from private.index_jobs');
reset role;
set local role authenticated;
select pg_temp.expect_denied('select public.backend_claim_index_jobs(3)');
select pg_temp.expect_denied($q$select public.backend_finish_index_job('profile','1a000000-0000-0000-0000-000000000002',1,true)$q$);
select pg_temp.expect_denied($q$select private.enqueue_index('profile','1a000000-0000-0000-0000-000000000002')$q$);
reset role;
set local role service_role;
select pg_temp.expect_denied('select private.invoke_index_pending()');
reset role;
-- Ambiguity must fail BEFORE reading Vault or initiating any network request.
insert into private.identity_providers(issuer,provider) values('https://index-test.example.invalid/auth/v1','supabase');
select pg_temp.expect_invalid('select private.invoke_index_pending()');
rollback;
select 'Durable indexing authorization, CAS, retries, credit visibility and lifecycle assertions passed; fixtures rolled back' as result;
