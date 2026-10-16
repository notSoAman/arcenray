-- Founder-approved switch to Supabase built-in gte-small (English, 384 dimensions).
-- Existing deployment has no embeddings/taste vectors. Abort rather than erase any
-- vectors if this precondition changes. Keep old migrations immutable.
-- Recovery: before any new indexing, revert column dimensions/functions to 1536;
-- after indexing, recovery requires reindexing with the chosen model, never casting.
do $$ begin
 if exists(select 1 from private.entity_embeddings) or exists(select 1 from private.user_state where taste_vector is not null) then
 raise exception 'Embedding migration requires an explicit reindex/reset plan for existing vectors';
 end if;
end $$;
alter table private.entity_embeddings alter column embedding type extensions.vector(384);
alter table private.user_state alter column taste_vector type extensions.vector(384);

create or replace function private.record_event(p_film_id uuid,p_kind text,p_idempotency_key uuid,p_watch_seconds numeric) returns void language plpgsql security definer set search_path='' as $$
 declare e extensions.vector(384); t extensions.vector(384); a real;
 begin
 if auth.uid() is null or not exists(select 1 from public.films where id=p_film_id and status='published' and not private.is_blocked(owner_id)) then raise exception 'Event not permitted' using errcode='42501'; end if;
 if (select count(*) from private.user_events where user_id=auth.uid() and created_at>now()-interval '1 minute')>=60 then raise exception 'Event rate limit'; end if;
 insert into private.user_events(user_id,idempotency_key,film_id,kind,watch_seconds) values(auth.uid(),p_idempotency_key,p_film_id,p_kind,p_watch_seconds) on conflict do nothing;
 if not found then return; end if;
 -- At most one taste update per film/kind/day even with fresh idempotency keys.
 if exists(select 1 from private.user_events where user_id=auth.uid() and film_id=p_film_id and kind=p_kind and idempotency_key<>p_idempotency_key and created_at>now()-interval '1 day') then return; end if;
 a:=case when p_kind='hook_watch' and p_watch_seconds>=10 then 0.08 when p_kind in ('film_complete','like','bookmark') then 0.25 else 0 end;
 select embedding into e from private.entity_embeddings where kind='film' and entity_id=p_film_id;
 if a=0 or e is null then return; end if;
 select taste_vector into t from private.user_state where user_id=auth.uid() for update;
 update private.user_state set taste_vector=case when t is null then e else (select array_agg((1-a)*x+a*y)::extensions.vector from unnest(t::real[],e::real[]) as v(x,y)) end,updated_at=now() where user_id=auth.uid();
 end; $$;

create or replace function private.semantic_score(p_kind text,p_id uuid,p_embedding extensions.vector(384)) returns double precision language sql stable security definer set search_path='' as $$
 select greatest(0,1-(embedding operator(extensions.<=>) p_embedding)) from private.entity_embeddings where kind=p_kind and entity_id=p_id; $$;

create or replace function public.hybrid_search(p_query text,p_kind text default 'all',p_city text default null,p_role text default null,p_genre text default null,p_limit integer default 20,p_embedding extensions.vector(384) default null)
 returns table(id uuid,kind text,title text,summary text,score double precision) language sql stable set search_path='' as $$
 with q as (select websearch_to_tsquery('english',left(p_query,500)) as ts), candidates as (
 select f.id,'film'::text as kind,f.title,f.synopsis as summary,
 ts_rank_cd(f.search_document,q.ts)::double precision as lexical,private.semantic_score('film',f.id,p_embedding) as semantic
 from public.films f cross join q where f.status='published' and p_kind in ('all','film')
 and (p_city is null or lower(f.location_city)=lower(p_city)) and (p_genre is null or p_genre=any(f.genres)) and p_role is null
 and (f.search_document@@q.ts or p_embedding is not null)
 union all
 select p.id,'profile',p.full_name,p.bio,ts_rank_cd(p.search_document,q.ts)::double precision,private.semantic_score('profile',p.id,p_embedding)
 from public.profiles p cross join q where p.onboarding_completed and p_kind in ('all','profile')
 and (p_city is null or lower(p.location_city)=lower(p_city)) and (p_role is null or p_role=any(p.roles)) and p_genre is null
 and (p.search_document@@q.ts or p_embedding is not null))
 select id,kind,title,summary,case when p_embedding is null then lexical/(1+lexical) else .7*coalesce(semantic,0)+.3*lexical/(1+lexical) end as score
 from candidates order by score desc,id limit least(greatest(p_limit,1),50); $$;

create or replace function public.backend_set_embedding(p_kind text,p_id uuid,p_owner uuid,p_embedding extensions.vector(384),p_hash text,p_updated_at timestamptz)
 returns boolean language plpgsql security definer set search_path='' as $$
 begin
 if p_embedding is null or extensions.vector_dims(p_embedding)<>384 then raise exception 'Expected gte-small 384-dimensional embedding'; end if;
 -- Serialize with edits; stale indexing requests cannot restore an obsolete embedding.
 if p_kind='film' then
 perform 1 from public.films where id=p_id and owner_id=p_owner and updated_at=p_updated_at for update;
 elsif p_kind='profile' then
 perform 1 from public.profiles where id=p_id and id=p_owner and updated_at=p_updated_at for update;
 else raise exception 'Invalid entity kind'; end if;
 if not found then return false; end if;
 insert into private.entity_embeddings(kind,entity_id,embedding,content_hash) values(p_kind,p_id,p_embedding,p_hash)
 on conflict(kind,entity_id) do update set embedding=excluded.embedding,content_hash=excluded.content_hash,updated_at=now();
 return true;
 end; $$;
