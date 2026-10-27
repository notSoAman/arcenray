-- Avoid collisions with the PL/pgSQL record variables a and m in the
-- capacity calculation, while preserving the existing admission policy.
do $$
declare
  definition text;
  old_query text := 'select coalesce((select sum(a.expected_bytes) from private.multipart_uploads m join private.media_assets a on a.id=m.asset_id where m.status in (''initializing'',''uploading'',''completing'') and a.status=''pending'' and m.resume_expires_at>now()),0)';
  new_query text := 'select coalesce((select sum(asset_row.expected_bytes) from private.multipart_uploads upload_row join private.media_assets asset_row on asset_row.id=upload_row.asset_id where upload_row.status in (''initializing'',''uploading'',''completing'') and asset_row.status=''pending'' and upload_row.resume_expires_at>now()),0)';
begin
  select pg_get_functiondef('private.backend_create_multipart(uuid,uuid,uuid,bigint,text)'::regprocedure) into definition;
  if position(old_query in definition) = 0 then
    raise exception 'Multipart capacity query changed; review before applying';
  end if;
  execute replace(definition, old_query, new_query);
end $$;
