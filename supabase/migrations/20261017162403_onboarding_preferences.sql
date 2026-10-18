-- Initial mood/reference labels are private preferences, never public profile fields.
-- No inference is required; an empty/unindexed catalog keeps the existing fallback feed.
create table private.onboarding_preferences (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 choices text[] not null,
 updated_at timestamptz not null default now(),
 constraint onboarding_choices_valid check (
  array_ndims(choices)=1 and cardinality(choices)=3 and array_position(choices,null) is null
  and choices <@ array['atmospheric','intimate','kinetic','dreamlike','tense','hopeful','melancholic','playful','gritty','experimental','documentary','musical']::text[]
  and choices[1]<>choices[2] and choices[1]<>choices[3] and choices[2]<>choices[3]
  and array_lower(choices,1)=1
 )
);
alter table private.onboarding_preferences enable row level security;
revoke all on private.onboarding_preferences from public,anon,authenticated;
grant all on private.onboarding_preferences to service_role;
create policy backend_only on private.onboarding_preferences to service_role using(true) with check(true);

create function private.set_onboarding_preferences(p_choices text[]) returns void
language plpgsql security definer set search_path='' as $$
 declare actor uuid:=private.current_profile_id();
 begin
 if actor is null then raise exception 'Sign in to save preferences' using errcode='42501'; end if;
 if p_choices is null or array_ndims(p_choices) is distinct from 1 or cardinality(p_choices)<>3 or array_lower(p_choices,1)<>1
 or array_position(p_choices,null) is not null
 or not(p_choices <@ array['atmospheric','intimate','kinetic','dreamlike','tense','hopeful','melancholic','playful','gritty','experimental','documentary','musical']::text[])
 or (select count(distinct c) from unnest(p_choices) c)<>3 then
 raise exception 'Choose exactly three different available preferences' using errcode='22023'; end if;
 insert into private.onboarding_preferences(user_id,choices) values(actor,p_choices)
 on conflict(user_id) do update set choices=excluded.choices,updated_at=now();
 end; $$;
create function public.set_onboarding_preferences(p_choices text[]) returns void
language sql set search_path='' as $$ select private.set_onboarding_preferences(p_choices); $$;
revoke all on function private.set_onboarding_preferences(text[]),public.set_onboarding_preferences(text[]) from public,anon,authenticated;
grant execute on function private.set_onboarding_preferences(text[]),public.set_onboarding_preferences(text[]) to authenticated,service_role;
