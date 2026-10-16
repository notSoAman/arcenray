-- Separate the operations credential from managed API JWT serialization/rotation.
-- Both credentials are encrypted in Vault; neither is exposed to clients.
create or replace function private.invoke_media_cleanup() returns bigint language plpgsql security definer set search_path='' as $$
 declare token text; cleanup_secret text; request_id bigint;
 begin
 select decrypted_secret into token from vault.decrypted_secrets where name='arcenray_cleanup_service_role';
 select decrypted_secret into cleanup_secret from vault.decrypted_secrets where name='arcenray_cleanup_secret';
 if token is null or cleanup_secret is null then raise exception 'Cleanup credentials are not configured in Vault'; end if;
 select net.http_post(url:='https://ropbxsnjtejfomnpdllf.supabase.co/functions/v1/media-cleanup',
 headers:=jsonb_build_object('Authorization','Bearer '||token,'x-cleanup-secret',cleanup_secret,'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=60000) into request_id;
 return request_id;
 end; $$;
revoke all on function private.invoke_media_cleanup() from public,anon,authenticated,service_role;
