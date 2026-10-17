-- Synthetic vectors test ranking and taste math independently of the embedding runtime.
begin;
-- Legacy-account compatibility during the Clerk migration.
select set_config('request.jwt.claims','{"iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1","role":"authenticated"}',true);
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end; $$;
insert into auth.users(id,email) values('12000000-0000-0000-0000-000000000001','taste-'||gen_random_uuid()||'@example.invalid');
update public.profiles set full_name='Taste fixture',roles=array['director'],onboarding_completed=true where id='12000000-0000-0000-0000-000000000001';
insert into public.films(id,owner_id,title,status,published_at) values('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','Quiet vector fixture','published',now());
insert into private.entity_embeddings(kind,entity_id,embedding,content_hash) values('film','22000000-0000-0000-0000-000000000001',(array[1::real]||array_fill(0::real,array[383]))::extensions.vector,'fixture');
update private.user_state set taste_vector=(array[0::real,1::real]||array_fill(0::real,array[382]))::extensions.vector where user_id='12000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select public.record_event('22000000-0000-0000-0000-000000000001','hook_watch','32000000-0000-0000-0000-000000000001',12);
select public.record_event('22000000-0000-0000-0000-000000000001','hook_watch','32000000-0000-0000-0000-000000000001',12);
select public.record_event('22000000-0000-0000-0000-000000000001','hook_watch','32000000-0000-0000-0000-000000000002',12);
select pg_temp.assert_true((select count(*)=1 from public.hybrid_search('quiet','film',null,null,null,20,(array[1::real]||array_fill(0::real,array[383]))::extensions.vector) where id='22000000-0000-0000-0000-000000000001'),'hybrid vector search readable');
reset role;
do $$ begin
 begin
  perform public.backend_set_embedding('film','22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001',array_fill(0::real,array[1536])::extensions.vector,'wrong-model',now());
  raise exception 'FAIL: old model dimensions accepted';
 exception when raise_exception then
  if sqlerrm <> 'Expected gte-small 384-dimensional embedding' then raise; end if;
 end;
end $$;
select pg_temp.assert_true((select abs((taste_vector::real[])[1]-.08)<.00001 and abs((taste_vector::real[])[2]-.92)<.00001 from private.user_state where user_id='12000000-0000-0000-0000-000000000001'),'light taste signal applies once per film/kind/day');
set local role authenticated;
select public.record_event('22000000-0000-0000-0000-000000000001','film_complete','32000000-0000-0000-0000-000000000003',1);
select pg_temp.assert_true((select count(*)=0 from public.get_personalized_feed() where id='22000000-0000-0000-0000-000000000001'),'consumed film excluded');
reset role;
select pg_temp.assert_true((select abs((taste_vector::real[])[1]-.31)<.00001 from private.user_state where user_id='12000000-0000-0000-0000-000000000001'),'strong taste signal uses 0.25 blend');
rollback;
select 'Recommendation assertions passed; fixtures rolled back' as result;
