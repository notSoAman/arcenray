-- Clerk subjects map to stable application UUIDs. Preserve existing accounts/data.
alter table public.profiles drop constraint profiles_id_fkey;
create table private.identity_providers (
 issuer text primary key check(issuer ~ '^https://[^/]+(/auth/v1)?$'),
 provider text not null check(provider in ('supabase','clerk')),
 enabled boolean not null default true
);
insert into private.identity_providers(issuer,provider) values('https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1','supabase');
insert into private.identity_providers(issuer,provider) values('https://growing-burro-9418.clerk.accounts.dev','clerk');
create table private.auth_identities (
 issuer text not null references private.identity_providers(issuer),
 subject text not null check(length(subject) between 1 and 255),
 profile_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(issuer,subject), unique(issuer,profile_id)
);
alter table private.identity_providers enable row level security;
alter table private.auth_identities enable row level security;
revoke all on private.identity_providers,private.auth_identities from public,anon,authenticated;
grant all on private.identity_providers,private.auth_identities to service_role;
create policy backend_only on private.identity_providers to service_role using(true) with check(true);
create policy backend_only on private.auth_identities to service_role using(true) with check(true);

create function private.current_profile_id() returns uuid language plpgsql stable security definer set search_path='' as $$
 declare v_issuer text:=auth.jwt()->>'iss'; v_subject text:=coalesce(auth.jwt()->>'sub',nullif(current_setting('request.jwt.claim.sub',true),'')); v_provider text; result uuid;
 begin
 select p.provider into v_provider from private.identity_providers p where p.issuer=v_issuer and p.enabled;
 if v_provider='supabase' and v_subject ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
 select p.id into result from public.profiles p join auth.users u on u.id=p.id where p.id=v_subject::uuid;
 elsif v_provider='clerk' then
 select profile_id into result from private.auth_identities i where i.issuer=v_issuer and i.subject=v_subject;
 end if;
 return result;
 end; $$;
create function public.current_profile_id() returns uuid language sql stable set search_path='' as $$ select private.current_profile_id(); $$;

create function private.ensure_current_profile() returns uuid language plpgsql security definer set search_path='' as $$
 declare v_issuer text:=auth.jwt()->>'iss'; v_subject text:=auth.jwt()->>'sub'; result uuid;
 begin
 if auth.jwt()->>'role' is distinct from 'authenticated' or v_subject is null or length(v_subject) not between 1 and 255 or
 not exists(select 1 from private.identity_providers p where p.issuer=v_issuer and p.provider='clerk' and p.enabled) then
 raise exception 'Trusted Clerk authentication required' using errcode='42501'; end if;
 -- Serialize signup races for one verified identity; never accept a client profile ID.
 perform pg_advisory_xact_lock(hashtextextended(v_issuer||chr(31)||v_subject,0));
 select profile_id into result from private.auth_identities i where i.issuer=v_issuer and i.subject=v_subject;
 if result is not null then return result; end if;
 result:=gen_random_uuid();
 insert into public.profiles(id,handle) values(result,replace(result::text,'-',''));
 insert into private.user_state(user_id) values(result);
 insert into private.auth_identities(issuer,subject,profile_id) values(v_issuer,v_subject,result);
 return result;
 end; $$;
create function public.ensure_current_profile() returns uuid language sql set search_path='' as $$ select private.ensure_current_profile(); $$;

-- Verified administrator migration only. Never called using client metadata/email.
create function private.backend_link_identity(p_issuer text,p_subject text,p_profile uuid) returns void language plpgsql security definer set search_path='' as $$
 begin
 if not exists(select 1 from private.identity_providers where issuer=p_issuer and provider='clerk' and enabled) then raise exception 'Issuer not configured'; end if;
 insert into private.auth_identities(issuer,subject,profile_id) values(p_issuer,p_subject,p_profile);
 end; $$;

create function public.backend_link_identity(p_issuer text,p_subject text,p_profile uuid) returns void language sql set search_path='' as $$ select private.backend_link_identity(p_issuer,p_subject,p_profile); $$;

-- Deleting a legacy fixture/account still cleans its unmigrated profile. Migrated
-- ownership survives deletion of the old auth record; revoked legacy IDs resolve null.
create function private.legacy_user_deleted() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if not exists(select 1 from private.auth_identities where profile_id=old.id) then delete from public.profiles where id=old.id; end if;
 return old;
 end; $$;
create trigger arcenray_legacy_user_deleted after delete on auth.users for each row execute function private.legacy_user_deleted();
revoke all on function private.legacy_user_deleted() from public,anon,authenticated;

-- Update existing application functions and RLS predicates together. No auth schema
-- function is modified; CREATE OR REPLACE/ALTER POLICY retain existing grants.
do $$ declare f record; p record; definition text; sql text;
 begin
 for f in select x.oid from pg_proc x join pg_namespace n on n.oid=x.pronamespace
 where n.nspname in ('public','private') and x.prokind='f' loop
 definition:=pg_get_functiondef(f.oid);
 if position('auth.uid()' in definition)>0 then execute replace(definition,'auth.uid()','private.current_profile_id()'); end if;
 end loop;
 for p in select * from pg_policies where schemaname in ('public','private') loop
 if coalesce(p.qual,'') like '%auth.uid()%' or coalesce(p.with_check,'') like '%auth.uid()%' then
 sql:=format('alter policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
 if p.qual is not null then sql:=sql||' using ('||replace(p.qual,'auth.uid()','private.current_profile_id()')||')'; end if;
 if p.with_check is not null then sql:=sql||' with check ('||replace(p.with_check,'auth.uid()','private.current_profile_id()')||')'; end if;
 execute sql;
 end if;
 end loop;
 end $$;

revoke all on function private.current_profile_id(),public.current_profile_id(),private.ensure_current_profile(),public.ensure_current_profile(),public.backend_link_identity(text,text,uuid),private.backend_link_identity(text,text,uuid) from public,anon,authenticated;
grant execute on function private.current_profile_id(),public.current_profile_id() to anon,authenticated,service_role;
grant execute on function private.ensure_current_profile(),public.ensure_current_profile() to authenticated,service_role;
grant execute on function public.backend_link_identity(text,text,uuid),private.backend_link_identity(text,text,uuid) to service_role;
