-- Credits are filmmaker-supplied attribution. Remove the recipient confirmation
-- workflow while retaining historical state/audit columns for existing rows.
alter table public.film_credits
  alter column verification_state set default 'accepted';

drop function if exists public.get_my_credit_invitations();
drop function if exists private.get_my_credit_invitations();
drop function if exists public.invite_film_credit(uuid, uuid, text);
drop function if exists private.invite_film_credit(uuid, uuid, text);
drop function if exists public.respond_to_credit(uuid, boolean);
drop function if exists private.respond_to_credit(uuid, boolean);

drop policy if exists credits_insert on public.film_credits;
create policy credits_insert on public.film_credits for insert to authenticated with check (
  exists(
    select 1 from public.films f
    where f.id = film_id
      and f.owner_id = (select private.current_profile_id())
      and f.status in ('draft', 'published')
      and private.film_available(f.id)
  )
  and (
    profile_id is null
    or exists(
      select 1 from public.profiles p
      where p.id = profile_id
        and p.onboarding_completed
        and private.profile_available(p.id)
        and not private.is_blocked(p.id)
    )
  )
);

create or replace function private.index_source(p_kind text, p_id uuid)
returns table(owner_id uuid, source_updated_at timestamptz, content text)
language sql stable security definer set search_path='' as $$
 select f.owner_id,f.updated_at,left(concat_ws(E'\n',nullif(f.title,''),nullif(array_to_string(f.genres,', '),''),
 nullif(array_to_string(f.mood_tags,', '),''),nullif(f.location_city,''),nullif(f.language,''),nullif(f.synopsis,''),
 (select string_agg(c.display_name||': '||c.role,E'\n' order by c.id) from public.film_credits c where c.film_id=f.id)),6000)
 from public.films f where p_kind='film' and f.id=p_id and f.status='published'
 and private.profile_available(f.owner_id) and private.film_available(f.id)
 union all
 select p.id,p.updated_at,left(concat_ws(E'\n',nullif(p.full_name,''),nullif(array_to_string(p.roles,', '),''),
 nullif(array_to_string(p.skills_gear,', '),''),nullif(p.location_city,''),nullif(p.bio,''),
 (select string_agg(c.role,E'\n' order by c.id) from public.film_credits c join public.films f on f.id=c.film_id
 where c.profile_id=p.id and f.status='published'
 and private.profile_available(f.owner_id) and private.film_available(f.id))),6000)
 from public.profiles p where p_kind='profile' and p.id=p_id and p.onboarding_completed and private.profile_available(p.id);
$$;

comment on column public.film_credits.verification_state is
  'Legacy compatibility field; film credits are listed without recipient confirmation.';
comment on column public.film_credits.verified_by is
  'Legacy audit field retained for existing records; no longer used by the product.';
comment on column public.film_credits.verified_at is
  'Legacy audit field retained for existing records; no longer used by the product.';
