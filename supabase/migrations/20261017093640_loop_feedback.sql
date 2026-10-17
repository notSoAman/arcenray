-- Private explicit feedback is separate from public likes and watch events.
create table private.film_feedback (
 user_id uuid not null references public.profiles(id) on delete cascade,
 film_id uuid not null references public.films(id) on delete cascade,
 preference text not null check(preference in ('more','less')),
 updated_at timestamptz not null default now(),
 primary key(user_id,film_id)
);
alter table private.film_feedback enable row level security;
revoke all on private.film_feedback from public,anon,authenticated;
grant all on private.film_feedback to service_role;
create policy backend_only on private.film_feedback to service_role using(true) with check(true);

create function private.set_film_feedback(p_film_id uuid,p_preference text) returns void
language plpgsql security definer set search_path='' as $$
 declare actor uuid:=private.current_profile_id();
 begin
 if actor is null then raise exception 'Sign in to save preferences' using errcode='42501'; end if;
 if p_preference is null or p_preference not in ('more','less') then raise exception 'Invalid preference' using errcode='22023'; end if;
 if not exists(select 1 from public.films f where f.id=p_film_id and f.status='published' and not private.is_blocked(f.owner_id)) then
 raise exception 'Film is not available' using errcode='42501'; end if;
 insert into private.film_feedback(user_id,film_id,preference) values(actor,p_film_id,p_preference)
 on conflict(user_id,film_id) do update set preference=excluded.preference,updated_at=now()
 where film_feedback.preference<>excluded.preference;
 end; $$;
create function public.set_film_feedback(p_film_id uuid,p_preference text) returns void
language sql set search_path='' as $$ select private.set_film_feedback(p_film_id,p_preference); $$;

create function private.get_my_film_feedback() returns table(film_id uuid,preference text)
language sql stable security definer set search_path='' as $$
 select f.film_id,f.preference from private.film_feedback f where f.user_id=private.current_profile_id(); $$;
create function public.get_my_film_feedback() returns table(film_id uuid,preference text)
language sql stable set search_path='' as $$ select * from private.get_my_film_feedback(); $$;

-- Average signed cosine affinity: repeat clicks cannot amplify the same film.
-- No raw embeddings or another user's preferences are returned to callers.
create function private.loop_affinity(p_film uuid) returns double precision
language sql stable security definer set search_path='' as $$
 select coalesce(private.film_affinity(p_film),0)+coalesce((
 select .35*avg((case when h.preference='more' then 1 else -1 end)*
 greatest(0,1-(target.embedding operator(extensions.<=>) source.embedding)))
 from private.entity_embeddings target join private.film_feedback h on h.user_id=private.current_profile_id()
 join private.entity_embeddings source on source.kind='film' and source.entity_id=h.film_id
 join public.films original on original.id=h.film_id and original.status='published' and not private.is_blocked(original.owner_id)
 where target.kind='film' and target.entity_id=p_film
 ),0); $$;
create or replace function private.has_consumed(p_film uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.user_events where user_id=private.current_profile_id() and film_id=p_film and kind in ('film_complete','skip'))
 or exists(select 1 from private.film_feedback where user_id=private.current_profile_id() and film_id=p_film and preference='less'); $$;
create or replace function public.get_personalized_feed(p_limit integer default 20,p_offset integer default 0,p_genre text default null) returns setof public.films
language sql stable set search_path='' as $$
 select f.* from public.films f where f.status='published' and not private.has_consumed(f.id) and (p_genre is null or p_genre=any(f.genres))
 order by private.loop_affinity(f.id) desc,f.published_at desc,f.id
 limit least(greatest(p_limit,1),50) offset least(greatest(p_offset,0),10000); $$;

-- Exclude seen IDs instead of using offsets against rankings changed by feedback.
-- The query remains security-invoker: public film RLS applies to every page.
create function public.get_loop_feed(p_limit integer default 10,p_exclude_ids uuid[] default '{}') returns setof public.films
language plpgsql stable set search_path='' as $$
 begin
 if cardinality(p_exclude_ids)>10000 or array_position(p_exclude_ids,null) is not null then
 raise exception 'Invalid pagination history' using errcode='22023'; end if;
 return query select f.* from public.films f where f.status='published' and not private.has_consumed(f.id)
 and not(f.id=any(coalesce(p_exclude_ids,'{}'::uuid[])))
 order by private.loop_affinity(f.id) desc,f.published_at desc,f.id limit least(greatest(p_limit,1),50);
 end; $$;
revoke all on function private.set_film_feedback(uuid,text),public.set_film_feedback(uuid,text),private.get_my_film_feedback(),public.get_my_film_feedback(),private.loop_affinity(uuid),public.get_loop_feed(integer,uuid[]) from public,anon,authenticated;
grant execute on function private.set_film_feedback(uuid,text),public.set_film_feedback(uuid,text),private.get_my_film_feedback(),public.get_my_film_feedback() to authenticated,service_role;
grant execute on function private.loop_affinity(uuid),public.get_loop_feed(integer,uuid[]) to anon,authenticated,service_role;
