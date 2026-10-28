-- Attach a completed multipart reservation during trusted verification. The
-- clients cannot wait for a verification receipt before attaching the asset:
-- processing requires the draft association in the same transaction.
do $$ declare definition text; begin
  select pg_get_functiondef('private.backend_verify_asset(uuid,uuid,bigint,text,integer,integer,numeric)'::regprocedure) into definition;
  if position('perform private.enqueue_media_processing(a.id)' in definition)=0
    or position('declare a private.media_assets;' in definition)=0 then
    raise exception 'Verification function changed; review before applying';
  end if;
end $$;
create or replace function private.backend_verify_asset(
  p_id uuid, p_owner uuid, p_bytes bigint, p_etag text,
  p_width integer, p_height integer, p_duration numeric default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.media_assets; m private.multipart_uploads;
begin
  -- Match the owner-first locking order used by draft and upload operations.
  perform 1 from private.user_state where user_id=p_owner for update;
  select * into a from private.media_assets where id=p_id and owner_id=p_owner for update;
  if not found then raise exception 'Asset missing'; end if;
  if a.status in ('uploaded','ready') then return to_jsonb(a); end if;
  if a.status<>'pending' or a.expires_at<now() or a.expected_bytes<>p_bytes
     or p_etag is null or length(p_etag)>128 then raise exception 'Invalid upload'; end if;
  if a.kind='film' then
    select * into m from private.multipart_uploads where asset_id=a.id for update;
    if found and (m.owner_id<>p_owner or m.status<>'completed' or m.draft_id is null) then
      raise exception 'Completed owned draft upload required' using errcode='42501';
    end if;
    update private.media_assets set status='uploaded',actual_bytes=p_bytes,etag=p_etag,
      width=null,height=null,duration_seconds=null where id=p_id returning * into a;
    if m.asset_id is not null then
      update public.films f set film_asset_id=a.id
      where f.id=m.draft_id and f.owner_id=p_owner and f.status='draft'
        and (f.film_asset_id is null or f.film_asset_id=a.id)
        and private.profile_available(p_owner) and private.film_available(f.id);
      if not found then raise exception 'Active owned draft required' using errcode='42501'; end if;
    end if;
    perform private.enqueue_media_processing(a.id);
    return to_jsonb(a);
  end if;
  if p_width<=0 or p_height<=0 or p_width is null or p_height is null then raise exception 'Invalid dimensions'; end if;
  if a.kind='profile_picture' and (p_width>256 or p_height>256) then raise exception 'Profile picture exceeds 256px'; end if;
  if a.kind='poster' and (p_width>800 or p_height>1200) then raise exception 'Poster exceeds 800x1200'; end if;
  if a.kind='hook' and (p_duration is null or p_duration<=0 or p_duration>30 or greatest(p_width,p_height)>1280 or least(p_width,p_height)>720) then raise exception 'Hook exceeds 30 seconds or 720p'; end if;
  update private.media_assets set status='uploaded',actual_bytes=p_bytes,etag=p_etag,width=p_width,height=p_height,duration_seconds=p_duration where id=p_id returning * into a;
  return to_jsonb(a);
end; $$;
