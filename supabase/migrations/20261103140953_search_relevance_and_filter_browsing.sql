-- Keep the public contract and invoker/RLS boundary. Exact identity matches must
-- outrank semantic suggestions; filters also work without a text query.
create or replace function public.hybrid_search(p_query text,p_kind text default 'all',p_city text default null,p_role text default null,p_genre text default null,p_limit integer default 20,p_embedding extensions.vector(384) default null)
 returns table(id uuid,kind text,title text,summary text,score double precision)
 language sql stable set search_path='' as $$
 with q as (
   select lower(btrim(left(coalesce(p_query,''),500))) as phrase,
     lower(ltrim(btrim(left(coalesce(p_query,''),500)),'@')) as name,
     websearch_to_tsquery('english',left(coalesce(p_query,''),500)) as ts,
     nullif(lower(btrim(p_city)),'') as city,
     nullif(replace(lower(btrim(p_role)),' ','_'),'') as role,
     nullif(lower(btrim(p_genre)),'') as genre
 ), candidates as (
   select f.id,'film'::text as kind,f.title,f.synopsis as summary,f.published_at as recent,
     case when q.phrase='' then 0 when lower(f.title)=q.phrase then 4
       when starts_with(lower(f.title),q.phrase) then 3
       when strpos(lower(f.title),q.phrase)>0 then 2 else 0 end as identity_match,
     ts_rank_cd(f.search_document || to_tsvector('english',array_to_string(f.genres||f.mood_tags,' ')),q.ts)::double precision as lexical,
     case when q.phrase<>'' and p_embedding is not null then private.semantic_score('film',f.id,p_embedding) end as semantic
   from public.films f cross join q
   where f.status='published' and p_kind in ('all','film') and q.role is null
     and (q.city is null or lower(btrim(f.location_city))=q.city)
     and (q.genre is null or exists(select 1 from unnest(f.genres) g where lower(btrim(g))=q.genre))
   union all
   select p.id,'profile',coalesce(nullif(p.full_name,''),p.handle),p.bio,p.updated_at,
     case when q.name='' then 0 when lower(p.full_name)=q.name or lower(p.handle)=q.name then 4
       when starts_with(lower(p.full_name),q.name) or starts_with(lower(p.handle),q.name) then 3
       when strpos(lower(p.full_name),q.name)>0 or strpos(lower(p.handle),q.name)>0 then 2 else 0 end,
     ts_rank_cd(p.search_document || to_tsvector('english',replace(array_to_string(p.roles||p.skills_gear,' '),'_',' ')),q.ts)::double precision,
     case when q.phrase<>'' and p_embedding is not null then private.semantic_score('profile',p.id,p_embedding) end
   from public.profiles p cross join q
   where p.onboarding_completed and p_kind in ('all','profile') and q.genre is null
     and (q.city is null or lower(btrim(p.location_city))=q.city)
     and (q.role is null or exists(select 1 from unnest(p.roles) r where replace(lower(btrim(r)),' ','_')=q.role))
 )
 select c.id,c.kind,c.title,c.summary,
   c.identity_match + .3*c.lexical/(1+c.lexical) + .7*coalesce(c.semantic,0) as score
 from candidates c cross join q
 where q.phrase='' or c.identity_match>0 or c.lexical>0 or c.semantic>=.45
 order by score desc,c.recent desc nulls last,c.id
 limit least(greatest(p_limit,1),50);
$$;
