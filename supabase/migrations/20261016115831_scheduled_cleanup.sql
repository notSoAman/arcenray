create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create function private.invoke_media_cleanup() returns bigint language plpgsql security definer set search_path='' as $$
 declare token text; request_id bigint;
 begin
 select decrypted_secret into token from vault.decrypted_secrets where name='arcenray_cleanup_service_role';
 if token is null then raise exception 'Cleanup credential is not configured in Vault'; end if;
 select net.http_post(url:='https://ropbxsnjtejfomnpdllf.supabase.co/functions/v1/media-cleanup',
 headers:=jsonb_build_object('Authorization','Bearer '||token,'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=60000) into request_id;
 return request_id;
 end; $$;
revoke all on function private.invoke_media_cleanup() from public,anon,authenticated,service_role;
select cron.schedule('arcenray-media-cleanup','*/15 * * * *','select private.invoke_media_cleanup()');
