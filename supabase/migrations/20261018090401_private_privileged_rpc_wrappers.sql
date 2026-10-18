-- Keep elevated execution in the unexposed schema. Public signatures/grants and
-- all existing identity/ownership/moderator checks remain unchanged.
alter function public.delete_my_film(uuid,text) set schema private;
alter function public.get_account_status() set schema private;
alter function public.get_moderation_reports() set schema private;
alter function public.moderate_report(uuid,text,text) set schema private;
alter function public.moderate_film(uuid,boolean,text) set schema private;
alter function public.moderate_profile(uuid,boolean,text) set schema private;
create function public.delete_my_film(p_film uuid,p_confirmation text) returns void language sql security invoker set search_path='' as $$ select private.delete_my_film(p_film,p_confirmation); $$;
create function public.get_account_status() returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_account_status(); $$;
create function public.get_moderation_reports() returns setof public.content_reports language sql stable security invoker set search_path='' as $$ select * from private.get_moderation_reports(); $$;
create function public.moderate_report(p_report uuid,p_status text,p_reason text) returns void language sql security invoker set search_path='' as $$ select private.moderate_report(p_report,p_status,p_reason); $$;
create function public.moderate_film(p_film uuid,p_hidden boolean,p_reason text) returns void language sql security invoker set search_path='' as $$ select private.moderate_film(p_film,p_hidden,p_reason); $$;
create function public.moderate_profile(p_profile uuid,p_suspended boolean,p_reason text) returns void language sql security invoker set search_path='' as $$ select private.moderate_profile(p_profile,p_suspended,p_reason); $$;
revoke all on function public.delete_my_film(uuid,text),public.get_account_status(),public.get_moderation_reports(),public.moderate_report(uuid,text,text),public.moderate_film(uuid,boolean,text),public.moderate_profile(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.delete_my_film(uuid,text),public.get_account_status(),public.get_moderation_reports(),public.moderate_report(uuid,text,text),public.moderate_film(uuid,boolean,text),public.moderate_profile(uuid,boolean,text) to authenticated,service_role;
