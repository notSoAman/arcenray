-- Transactional publication and authorization checks; no fixtures survive rollback.
begin;
select set_config('request.jwt.claims','{"iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1","role":"authenticated"}',true);
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end; $$;
create function pg_temp.expect_denied(statement text) returns void language plpgsql as $$ begin
 begin execute statement; exception when insufficient_privilege or check_violation or raise_exception then return; end;
 raise exception 'FAIL: expected denial: %',statement;
end; $$;
insert into auth.users(id,email) values
('58000000-0000-0000-0000-000000000001','optional-hook-a-'||gen_random_uuid()||'@example.invalid'),
('58000000-0000-0000-0000-000000000002','optional-hook-b-'||gen_random_uuid()||'@example.invalid');
update public.profiles set full_name='Hook fixture',roles=array['director'],onboarding_completed=true where id in ('58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000002');
insert into private.media_assets(id,owner_id,kind,object_key,public_key,expected_bytes,actual_bytes,content_type,status,duration_seconds) values
('58100000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000001','film','fixture/optional/main','assets/58100000-0000-0000-0000-000000000001',100,100,'video/mp4','ready',60),
('58100000-0000-0000-0000-000000000002','58000000-0000-0000-0000-000000000001','poster','fixture/optional/poster','assets/58100000-0000-0000-0000-000000000002',100,100,'image/webp','ready',null),
('58100000-0000-0000-0000-000000000003','58000000-0000-0000-0000-000000000001','hook','fixture/optional/good','assets/58100000-0000-0000-0000-000000000003',100,100,'video/mp4','ready',30),
('58100000-0000-0000-0000-000000000004','58000000-0000-0000-0000-000000000001','hook','fixture/optional/long','assets/58100000-0000-0000-0000-000000000004',100,100,'video/mp4','ready',31),
('58100000-0000-0000-0000-000000000005','58000000-0000-0000-0000-000000000001','hook','fixture/optional/pending',null,100,null,'video/mp4','pending',null);
insert into public.films(id,owner_id,title,source,provider_id,film_asset_id,hook_asset_id,poster_asset_id) values
('58200000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000001','Native poster only','r2_native',null,'58100000-0000-0000-0000-000000000001',null,'58100000-0000-0000-0000-000000000002'),
('58200000-0000-0000-0000-000000000002','58000000-0000-0000-0000-000000000001','External poster only','youtube_embed','abcdefghijk',null,null,'58100000-0000-0000-0000-000000000002'),
('58200000-0000-0000-0000-000000000003','58000000-0000-0000-0000-000000000001','With hook','r2_native',null,'58100000-0000-0000-0000-000000000001','58100000-0000-0000-0000-000000000003','58100000-0000-0000-0000-000000000002'),
('58200000-0000-0000-0000-000000000004','58000000-0000-0000-0000-000000000001','Invalid long hook','r2_native',null,'58100000-0000-0000-0000-000000000001','58100000-0000-0000-0000-000000000004','58100000-0000-0000-0000-000000000002'),
('58200000-0000-0000-0000-000000000005','58000000-0000-0000-0000-000000000001','Missing poster','r2_native',null,'58100000-0000-0000-0000-000000000001',null,null),
('58200000-0000-0000-0000-000000000006','58000000-0000-0000-0000-000000000001','Missing film','r2_native',null,null,null,'58100000-0000-0000-0000-000000000002'),
('58200000-0000-0000-0000-000000000007','58000000-0000-0000-0000-000000000001','Unready hook','r2_native',null,'58100000-0000-0000-0000-000000000001','58100000-0000-0000-0000-000000000005','58100000-0000-0000-0000-000000000002');
set local role anon;
select pg_temp.expect_denied($q$select public.publish_film('58200000-0000-0000-0000-000000000001')$q$);
reset role;
select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select pg_temp.expect_denied($q$select public.publish_film('58200000-0000-0000-0000-000000000001')$q$);
reset role;
select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true((public.publish_film('58200000-0000-0000-0000-000000000001')).status='published','native publication without hook');
select pg_temp.assert_true((public.publish_film('58200000-0000-0000-0000-000000000002')).status='published','external publication without hook');
select pg_temp.assert_true((public.publish_film('58200000-0000-0000-0000-000000000003')).hook_key='assets/58100000-0000-0000-0000-000000000003','valid optional hook retained');
select pg_temp.expect_denied($q$select public.publish_film('58200000-0000-0000-0000-000000000004')$q$);
select pg_temp.expect_denied($q$select public.publish_film('58200000-0000-0000-0000-000000000005')$q$);
select pg_temp.expect_denied($q$select public.publish_film('58200000-0000-0000-0000-000000000006')$q$);
select pg_temp.expect_denied($q$select public.publish_film('58200000-0000-0000-0000-000000000007')$q$);
reset role;
set local role anon;
select pg_temp.assert_true((select hook_key is null and poster_key is not null from public.films where id='58200000-0000-0000-0000-000000000001'),'public card has poster without hook');
select pg_temp.assert_true((select count(*)=1 from public.get_personalized_feed() where id='58200000-0000-0000-0000-000000000001'),'poster-only film appears in guest feed');
reset role;
rollback;
select 'Optional discovery hook assertions passed; fixtures rolled back' as result;
