-- Founder requested no account-wide storage cap. NULL explicitly means unlimited;
-- byte accounting, file-size checks, locks and rate limits remain unchanged.
alter table private.user_state alter column quota_bytes drop not null;
alter table private.user_state alter column quota_bytes set default null;

-- Preserve the current hardened function bodies and grants. Fail closed if their
-- known guard statements have drifted instead of silently replacing an old body.
do $$
declare definition text;
begin
 select pg_get_functiondef('private.reserve_upload(text,bigint,text)'::regprocedure) into definition;
 if position('if lim is null then raise exception ''Profile missing'';' in definition)=0
 or position('if p_bytes<=0 or p_bytes+used>lim then' in definition)=0 then
 raise exception 'reserve_upload guards changed; review migration'; end if;
 definition:=replace(definition,'if lim is null then raise exception ''Profile missing'';',
 'if not found then raise exception ''Profile missing'';');
 definition:=replace(definition,'if p_bytes<=0 or p_bytes+used>lim then',
 'if p_bytes is null or p_bytes<=0 or p_bytes>2147483648 or (lim is not null and p_bytes+used>lim) then');
 execute definition;

 select pg_get_functiondef('private.backend_create_multipart(uuid,uuid,uuid,bigint,text)'::regprocedure) into definition;
 if position('if lim is null or not private.profile_available(p_owner) then' in definition)=0
 or position('if p_bytes+used>lim then' in definition)=0 then
 raise exception 'create_multipart guards changed; review migration'; end if;
 definition:=replace(definition,'if lim is null or not private.profile_available(p_owner) then',
 'if not found or not private.profile_available(p_owner) then');
 definition:=replace(definition,'if p_bytes+used>lim then',
 'if lim is not null and p_bytes+used>lim then');
 execute definition;
end $$;

-- Applies to existing accounts as well as the default for new signups.
update private.user_state set quota_bytes=null;
comment on column private.user_state.quota_bytes is 'NULL = no account storage cap. Usage is still recorded; per-file and abuse limits apply.';
