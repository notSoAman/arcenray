-- In-app project invitations reuse film_credits. No new public draft access.
create function public.search_credit_collaborators(p_query text, p_limit integer default 8)
returns table(profile_id uuid, handle text, full_name text, profile_pic_key text)
language sql stable security invoker set search_path='' as $$
 select p.id,p.handle,p.full_name,p.profile_pic_key from public.profiles p
 where private.current_profile_id() is not null and p.onboarding_completed
 and p.id<>private.current_profile_id()
 and length(trim(p_query)) between 2 and 80
 and (position(lower(ltrim(trim(p_query),'@')) in lower(p.handle))>0
   or position(lower(trim(p_query)) in lower(p.full_name))>0)
 order by (lower(p.handle)=lower(ltrim(trim(p_query),'@'))) desc,
 (position(lower(ltrim(trim(p_query),'@')) in lower(p.handle))=1) desc,p.handle,p.id
 limit least(greatest(coalesce(p_limit,8),1),10);
$$;

create function private.invite_film_credit(p_film_id uuid,p_profile_id uuid,p_role text)
returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=private.current_profile_id(); f public.films; person public.profiles; result uuid;
begin
 if me is null or p_profile_id is null or me=p_profile_id or p_role is null
 or length(trim(p_role)) not between 1 and 80 then
 raise exception 'Invitation not permitted' using errcode='42501'; end if;
 -- Serialize invitations against film deletion and each other, including role-case duplicates.
 select * into f from public.films where id=p_film_id for update;
 if not found or f.owner_id<>me or f.status not in ('draft','published')
 or not private.film_available(f.id) then
 raise exception 'Invitation not permitted' using errcode='42501'; end if;
 select * into person from public.profiles where id=p_profile_id for share;
 if not found or not person.onboarding_completed or not private.profile_available(person.id)
 or private.is_blocked(person.id) then
 raise exception 'Invitation not permitted' using errcode='42501'; end if;
 if exists(select 1 from public.film_credits c where c.film_id=p_film_id
 and c.profile_id=p_profile_id and lower(trim(c.role))=lower(trim(p_role))) then
 raise exception 'This person already has a credit or invitation for this role' using errcode='23505'; end if;
 insert into public.film_credits(film_id,profile_id,display_name,role)
 values(f.id,person.id,coalesce(nullif(trim(person.full_name),''),person.handle),trim(p_role)) returning id into result;
 return result;
end; $$;
create function public.invite_film_credit(p_film_id uuid,p_profile_id uuid,p_role text)
returns uuid language sql security invoker set search_path='' as $$
 select private.invite_film_credit(p_film_id,p_profile_id,p_role); $$;

create function private.get_my_credit_invitations()
returns table(credit_id uuid,film_id uuid,film_title text,film_status text,role text,owner_handle text,owner_name text,invited_at timestamptz)
language sql stable security definer set search_path='' as $$
 select c.id,f.id,f.title,f.status,c.role,p.handle,p.full_name,c.created_at
 from public.film_credits c join public.films f on f.id=c.film_id join public.profiles p on p.id=f.owner_id
 where c.profile_id=private.current_profile_id() and c.verification_state='pending'
 and f.owner_id<>private.current_profile_id() and f.status in ('draft','published')
 and private.profile_available(f.owner_id) and private.film_available(f.id) and not private.is_blocked(f.owner_id)
 order by c.created_at desc,c.id desc;
$$;
create function public.get_my_credit_invitations()
returns table(credit_id uuid,film_id uuid,film_title text,film_status text,role text,owner_handle text,owner_name text,invited_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select * from private.get_my_credit_invitations(); $$;

-- A decision is scoped to the invitee and can only happen once. Draft media stays private.
create or replace function private.respond_to_credit(p_credit_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.current_profile_id();
begin
 if me is null or p_accept is null then raise exception 'Credit not permitted' using errcode='42501'; end if;
 update public.film_credits c set verification_state=case when p_accept then 'accepted' else 'declined' end,
 verified_by=me,verified_at=now()
 where c.id=p_credit_id and c.profile_id=me and c.verification_state='pending'
 and exists(select 1 from public.films f where f.id=c.film_id and f.owner_id<>me
 and f.status in ('draft','published') and private.profile_available(f.owner_id)
 and private.film_available(f.id) and not private.is_blocked(f.owner_id));
 if not found then raise exception 'Credit not permitted' using errcode='42501'; end if;
end; $$;

-- Keep the original direct manual-credit route scoped too; unregistered/self entries remain unverified.
alter policy credits_insert on public.film_credits with check (
 verification_state='pending' and verified_by is null and verified_at is null
 and exists(select 1 from public.films f where f.id=film_id and f.owner_id=(select private.current_profile_id())
 and f.status in ('draft','published') and private.film_available(f.id))
 and (profile_id is null or exists(select 1 from public.profiles p where p.id=profile_id
 and p.onboarding_completed and private.profile_available(p.id) and not private.is_blocked(p.id)))
);

revoke all on function public.search_credit_collaborators(text,integer),public.invite_film_credit(uuid,uuid,text),
 private.invite_film_credit(uuid,uuid,text),public.get_my_credit_invitations(),private.get_my_credit_invitations()
 from public,anon,authenticated;
grant execute on function public.search_credit_collaborators(text,integer),public.invite_film_credit(uuid,uuid,text),
 private.invite_film_credit(uuid,uuid,text),public.get_my_credit_invitations(),private.get_my_credit_invitations() to authenticated;
