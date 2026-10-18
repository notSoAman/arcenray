begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end; $$;
insert into auth.users(id,email) values
('15000000-0000-0000-0000-000000000001','vibe-a-'||gen_random_uuid()||'@example.invalid'),
('15000000-0000-0000-0000-000000000002','vibe-b-'||gen_random_uuid()||'@example.invalid');
select set_config('request.jwt.claims','{"iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select public.set_onboarding_preferences(array['atmospheric','intimate','musical']);
select public.set_onboarding_preferences(array['atmospheric','intimate','musical']);
do $$ declare invalid text[]; begin
 foreach invalid slice 1 in array array[['atmospheric','atmospheric','intimate'],['atmospheric','unknown','intimate'],['atmospheric',null,'intimate']] loop
 begin perform public.set_onboarding_preferences(invalid); raise exception 'FAIL invalid choices accepted'; exception when invalid_parameter_value then null; end;
 end loop;
 begin perform public.set_onboarding_preferences(null);raise exception 'FAIL null choices';exception when invalid_parameter_value then null;end;
 begin perform public.set_onboarding_preferences(array['intimate']);raise exception 'FAIL short choices';exception when invalid_parameter_value then null;end;
 begin perform public.set_onboarding_preferences('{}'::text[]);raise exception 'FAIL empty choices';exception when invalid_parameter_value then null;end;
 begin perform public.set_onboarding_preferences('[0:2]={atmospheric,intimate,musical}'::text[]);raise exception 'FAIL unusual array bounds';exception when invalid_parameter_value then null;end;
 begin perform 1 from private.onboarding_preferences;raise exception 'FAIL private preferences exposed';exception when insufficient_privilege then null;end;
 begin insert into private.onboarding_preferences(user_id,choices) values('15000000-0000-0000-0000-000000000002',array['atmospheric','intimate','musical']);raise exception 'FAIL direct cross-user insert';exception when insufficient_privilege then null;end;
end $$;
reset role;
select pg_temp.assert_true((select count(*)=1 from private.onboarding_preferences where user_id='15000000-0000-0000-0000-000000000001'),'idempotent one row per actor');
select pg_temp.assert_true(not exists(select 1 from private.onboarding_preferences where user_id='15000000-0000-0000-0000-000000000002'),'cannot choose another actor');
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select public.set_onboarding_preferences(array['hopeful','playful','documentary']);
reset role;
select pg_temp.assert_true((select choices=array['atmospheric','intimate','musical'] from private.onboarding_preferences where user_id='15000000-0000-0000-0000-000000000001'),'other actor cannot alter first preferences');
select set_config('request.jwt.claims','{"iss":"https://untrusted.invalid","sub":"15000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 begin perform public.set_onboarding_preferences(array['atmospheric','intimate','musical']);raise exception 'FAIL forged issuer';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 begin perform public.set_onboarding_preferences(array['atmospheric','intimate','musical']);raise exception 'FAIL anonymous preferences';exception when insufficient_privilege then null;end;
 begin perform 1 from private.onboarding_preferences;raise exception 'FAIL guest reads';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'Onboarding preferences validation and privacy assertions passed; fixtures rolled back' as result;
