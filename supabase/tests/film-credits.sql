begin;
select set_config('request.jwt.claims','{"iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1","role":"authenticated"}',true);
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',message;end if;end; $$;
create function pg_temp.denied(statement text) returns void language plpgsql as $$ begin
 begin execute statement;exception when insufficient_privilege or check_violation or unique_violation or raise_exception then return;end;
 raise exception 'FAIL: expected denial: %',statement;end; $$;
insert into auth.users(id,email) values
('71000000-0000-0000-0000-000000000001','credit-owner-'||gen_random_uuid()||'@example.invalid'),
('71000000-0000-0000-0000-000000000002','credit-person-'||gen_random_uuid()||'@example.invalid'),
('71000000-0000-0000-0000-000000000003','credit-outsider-'||gen_random_uuid()||'@example.invalid');
update public.profiles set full_name='Credit Search Fixture',roles=array['editor'],onboarding_completed=true where id::text like '71000000-%';
update public.profiles set handle='credit_search_recipient' where id='71000000-0000-0000-0000-000000000002';
insert into public.films(id,owner_id,title,status) values
('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','Credit fixture film','published'),
('72000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000003','Another creator film','published');
select pg_temp.assert_true(to_regprocedure('public.get_my_credit_invitations()') is null,'credit inbox RPC removed');
select pg_temp.assert_true(to_regprocedure('public.invite_film_credit(uuid,uuid,text)') is null,'invite RPC removed');
select pg_temp.assert_true(to_regprocedure('public.respond_to_credit(uuid,boolean)') is null,'confirmation RPC removed');
set local role anon;
select pg_temp.denied($q$insert into public.film_credits(film_id,display_name,role) values('72000000-0000-0000-0000-000000000001','Anonymous','Editor')$q$);
reset role;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=1 from public.search_credit_collaborators('@credit_search_recipient')),'registered collaborator search remains available');
insert into public.film_credits(film_id,profile_id,display_name,role) values
('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002','Credit Search Fixture','Editor');
select pg_temp.assert_true((select count(*)=1 from public.film_credits where film_id='72000000-0000-0000-0000-000000000001' and profile_id='71000000-0000-0000-0000-000000000002'),'film owner adds a registered credit directly');
insert into public.film_credits(film_id,profile_id,display_name,role) values
('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000003','Outsider','Composer');
select pg_temp.assert_true((select count(*)=2 from public.film_credits where film_id='72000000-0000-0000-0000-000000000001'),'film owner can list another registered creative directly');
select pg_temp.denied($q$insert into public.film_credits(film_id,display_name,role) values('72000000-0000-0000-0000-000000000002','Outsider','Composer')$q$);
reset role;
select pg_temp.assert_true((select content like '%Credit Search Fixture: Editor%' from private.index_source('film','72000000-0000-0000-0000-000000000001')),'listed credit enters public film indexing without recipient confirmation');
select pg_temp.assert_true((select content like '%Editor%' from private.index_source('profile','71000000-0000-0000-0000-000000000002')),'listed credit enters the credited profile index without recipient confirmation');
rollback;
select 'Film credit listing, owner authorization, collaborator search and confirmation removal assertions passed; fixtures rolled back' as result;
