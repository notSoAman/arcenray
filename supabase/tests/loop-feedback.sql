begin;
-- Isolate this suite from a populated shared catalog without changing its content.
select set_config('arcenray.test.excluded',coalesce((select array_agg(id)::text from public.films),'{}'),true);
select set_config('request.jwt.claims','{"iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1","role":"authenticated"}',true);
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end; $$;
insert into auth.users(id,email) values
('13000000-0000-0000-0000-000000000001','loop-a-'||gen_random_uuid()||'@example.invalid'),
('13000000-0000-0000-0000-000000000002','loop-b-'||gen_random_uuid()||'@example.invalid');
update public.profiles set full_name='Loop test',roles=array['director'],onboarding_completed=true where id in ('13000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000002');
insert into public.films(id,owner_id,title,status,published_at) values
('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001','Loop original','published',now()-interval '3 day'),
('23000000-0000-0000-0000-000000000002','13000000-0000-0000-0000-000000000001','Loop similar','published',now()-interval '2 day'),
('23000000-0000-0000-0000-000000000003','13000000-0000-0000-0000-000000000001','Loop different','published',now()-interval '1 day'),
('23000000-0000-0000-0000-000000000004','13000000-0000-0000-0000-000000000001','Loop draft','draft',null);
insert into private.entity_embeddings(kind,entity_id,embedding,content_hash) values
('film','23000000-0000-0000-0000-000000000001',(array[1::real]||array_fill(0::real,array[383]))::extensions.vector,'loop1'),
('film','23000000-0000-0000-0000-000000000002',(array[1::real]||array_fill(0::real,array[383]))::extensions.vector,'loop2'),
('film','23000000-0000-0000-0000-000000000003',(array[0::real,1::real]||array_fill(0::real,array[382]))::extensions.vector,'loop3');
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select public.set_film_feedback('23000000-0000-0000-0000-000000000001','more');
select public.set_film_feedback('23000000-0000-0000-0000-000000000001','more');
select pg_temp.assert_true((select count(*)=1 from public.get_my_film_feedback()),'repeated feedback is idempotent');
select pg_temp.assert_true(private.loop_affinity('23000000-0000-0000-0000-000000000002')>private.loop_affinity('23000000-0000-0000-0000-000000000003'),'more boosts similar films');
select pg_temp.assert_true((select array_agg(id) from public.get_loop_feed(1,current_setting('arcenray.test.excluded')::uuid[]||array['23000000-0000-0000-0000-000000000001']::uuid[]))=array['23000000-0000-0000-0000-000000000002']::uuid[],'unseen ranked page excludes seen');
select public.set_film_feedback('23000000-0000-0000-0000-000000000001','less');
select pg_temp.assert_true(private.loop_affinity('23000000-0000-0000-0000-000000000002')<private.loop_affinity('23000000-0000-0000-0000-000000000003'),'less lowers similar films');
select pg_temp.assert_true(not exists(select 1 from public.get_loop_feed(50,current_setting('arcenray.test.excluded')::uuid[]) where id='23000000-0000-0000-0000-000000000001'),'less hides selected film');
select pg_temp.assert_true(not exists(select 1 from public.get_personalized_feed() where id='23000000-0000-0000-0000-000000000001'),'home feed respects less');
do $$ begin
 begin perform public.set_film_feedback('23000000-0000-0000-0000-000000000004','more');raise exception 'FAIL draft feedback';exception when insufficient_privilege then null;end;
 begin perform public.set_film_feedback('23000000-0000-0000-0000-000000000001','invalid');raise exception 'FAIL invalid feedback';exception when invalid_parameter_value then null;end;
 begin perform public.get_loop_feed(10,array[null]::uuid[]);raise exception 'FAIL null cursor';exception when invalid_parameter_value then null;end;
 begin perform public.get_loop_feed(10,array_fill(gen_random_uuid(),array[10001]));raise exception 'FAIL oversized cursor';exception when invalid_parameter_value then null;end;
 begin perform 1 from private.film_feedback;raise exception 'FAIL private feedback exposed';exception when insufficient_privilege then null;end;
end $$;
insert into public.user_blocks(blocker_id,blocked_id) values('13000000-0000-0000-0000-000000000002','13000000-0000-0000-0000-000000000001');
select pg_temp.assert_true(not exists(select 1 from public.get_loop_feed(50,current_setting('arcenray.test.excluded')::uuid[])),'blocked creator excluded from Loop');
do $$ begin
 begin perform public.set_film_feedback('23000000-0000-0000-0000-000000000001','more');raise exception 'FAIL blocked feedback';exception when insufficient_privilege then null;end;
end $$;
delete from public.user_blocks where blocker_id='13000000-0000-0000-0000-000000000002' and blocked_id='13000000-0000-0000-0000-000000000001';
reset role;
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.get_my_film_feedback()),'another user cannot see preferences');
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
set local role anon;
select pg_temp.assert_true(not exists(select 1 from public.get_loop_feed(50,current_setting('arcenray.test.excluded')::uuid[]) where id='23000000-0000-0000-0000-000000000004'),'guest never sees draft');
select pg_temp.assert_true(exists(select 1 from public.get_loop_feed(50,current_setting('arcenray.test.excluded')::uuid[]) where id='23000000-0000-0000-0000-000000000001'),'private less does not affect guest');
do $$ begin
 begin perform public.set_film_feedback('23000000-0000-0000-0000-000000000001','more');raise exception 'FAIL anonymous feedback';exception when insufficient_privilege then null;end;
 begin perform public.get_my_film_feedback();raise exception 'FAIL guest private history';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'Loop feedback, privacy and pagination assertions passed; fixtures rolled back' as result;
