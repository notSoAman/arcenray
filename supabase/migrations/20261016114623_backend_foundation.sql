-- Arcenray initial backend. Public columns are deliberate; sensitive state is private.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
create extension if not exists vector with schema extensions;

create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 handle text not null unique check (handle ~ '^[a-z0-9_]{3,32}$'),
 full_name text not null default '' check (length(full_name) <= 100),
 bio text not null default '' check (length(bio) <= 2000),
 roles text[] not null default '{}' check (cardinality(roles) <= 12),
 location_city text check (length(location_city) <= 100),
 skills_gear text[] not null default '{}' check (cardinality(skills_gear) <= 40),
 profile_pic_key text,
 onboarding_completed boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 search_document tsvector generated always as
 (to_tsvector('english', full_name || ' ' || handle || ' ' || bio || ' ' || coalesce(location_city,''))) stored,
 check (not onboarding_completed or (length(trim(full_name)) > 0 and cardinality(roles) > 0))
);
create table private.user_state (
 user_id uuid primary key references public.profiles on delete cascade,
 quota_bytes bigint not null default 2147483648 check (quota_bytes >= 0),
 taste_vector extensions.vector(1536), updated_at timestamptz not null default now()
);
create table private.media_assets (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles on delete cascade,
 kind text not null check (kind in ('film','hook','poster','profile_picture')),
 object_key text not null unique, public_key text unique,
 expected_bytes bigint not null check (expected_bytes > 0 and expected_bytes <= 2147483648),
 actual_bytes bigint check (actual_bytes > 0),
 content_type text not null check (content_type in ('video/mp4','image/webp')),
 status text not null default 'pending' check (status in ('pending','uploaded','ready','rejected')),
 duration_seconds numeric, width integer, height integer, etag text,
 expires_at timestamptz not null default now() + interval '1 hour',
 created_at timestamptz not null default now(),
 check ((kind in ('film','hook') and content_type='video/mp4') or
        (kind in ('poster','profile_picture') and content_type='image/webp'))
);
create table public.films (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles on delete cascade,
 title text not null check (length(trim(title)) between 1 and 200),
 synopsis text not null default '' check (length(synopsis) <= 5000),
 genres text[] not null default '{}' check (cardinality(genres) <= 8),
 mood_tags text[] not null default '{}' check (cardinality(mood_tags) <= 12),
 location_city text check (length(location_city) <= 100), language text check (length(language) <= 80),
 source text not null default 'r2_native' check (source in ('r2_native','vimeo_embed','youtube_embed')),
 provider_id text, status text not null default 'draft' check (status in ('draft','published','archived')),
 film_asset_id uuid references private.media_assets, hook_asset_id uuid references private.media_assets,
 poster_asset_id uuid references private.media_assets, duration_seconds numeric,
 film_key text, hook_key text, poster_key text,
 published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 search_document tsvector generated always as
 (to_tsvector('english', title || ' ' || synopsis || ' ' || coalesce(location_city,''))) stored,
 check ((source='r2_native' and provider_id is null) or
        (source='vimeo_embed' and provider_id is not null and provider_id ~ '^[0-9]{1,15}$') or
        (source='youtube_embed' and provider_id is not null and provider_id ~ '^[a-zA-Z0-9_-]{11}$'))
);
create table public.film_credits (
 id uuid primary key default gen_random_uuid(), film_id uuid not null references public.films on delete cascade,
 profile_id uuid references public.profiles on delete set null,
 display_name text not null check (length(trim(display_name)) between 1 and 100),
 role text not null check (length(trim(role)) between 1 and 80),
 verification_state text not null default 'pending' check (verification_state in ('pending','accepted','declined')),
 verified_by uuid references public.profiles on delete set null, verified_at timestamptz,
 created_at timestamptz not null default now(), unique(film_id,profile_id,role)
);
create table public.film_likes (
 user_id uuid not null references public.profiles on delete cascade,
 film_id uuid not null references public.films on delete cascade, created_at timestamptz not null default now(),
 primary key(user_id,film_id)
);
create table public.film_bookmarks (like public.film_likes including all);
alter table public.film_bookmarks add foreign key(user_id) references public.profiles on delete cascade;
alter table public.film_bookmarks add foreign key(film_id) references public.films on delete cascade;
create table public.profile_follows (
 follower_id uuid not null references public.profiles on delete cascade,
 following_id uuid not null references public.profiles on delete cascade,
 created_at timestamptz not null default now(), primary key(follower_id,following_id), check(follower_id<>following_id)
);
create table public.user_blocks (
 blocker_id uuid not null references public.profiles on delete cascade,
 blocked_id uuid not null references public.profiles on delete cascade,
 created_at timestamptz not null default now(), primary key(blocker_id,blocked_id), check(blocker_id<>blocked_id)
);
create table public.conversations (
 id uuid primary key default gen_random_uuid(),
 user_low uuid not null references public.profiles on delete cascade,
 user_high uuid not null references public.profiles on delete cascade,
 created_at timestamptz not null default now(), unique(user_low,user_high), check(user_low<user_high)
);
create table public.conversation_participants (
 conversation_id uuid not null references public.conversations on delete cascade,
 user_id uuid not null references public.profiles on delete cascade,
 last_read_at timestamptz not null default now(), primary key(conversation_id,user_id)
);
create table public.messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations on delete cascade,
 sender_id uuid not null references public.profiles on delete cascade,
 body text not null check(length(trim(body)) between 1 and 5000),
 film_id uuid references public.films on delete set null,
 client_id uuid not null default gen_random_uuid(), created_at timestamptz not null default now(),
 unique(sender_id,client_id)
);
create table public.content_reports (
 id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles on delete cascade,
 film_id uuid references public.films on delete cascade, profile_id uuid references public.profiles on delete cascade,
 message_id uuid references public.messages on delete cascade,
 reason text not null check(length(trim(reason)) between 3 and 1000),
 status text not null default 'open' check(status in ('open','reviewed','resolved')),
 created_at timestamptz not null default now(), check(num_nonnulls(film_id,profile_id,message_id)=1)
);
create table private.entity_embeddings (
 kind text not null check(kind in ('film','profile')), entity_id uuid not null,
 embedding extensions.vector(1536) not null, content_hash text not null,
 updated_at timestamptz not null default now(), primary key(kind,entity_id)
);
create table private.user_events (
 user_id uuid not null references public.profiles on delete cascade, idempotency_key uuid not null,
 film_id uuid not null references public.films on delete cascade,
 kind text not null check(kind in ('hook_watch','film_complete','like','bookmark','skip')),
 watch_seconds numeric not null default 0 check(watch_seconds between 0 and 86400),
 created_at timestamptz not null default now(), primary key(user_id,idempotency_key)
);

create index profiles_search_idx on public.profiles using gin(search_document);
create index profiles_roles_idx on public.profiles using gin(roles);
create index profiles_city_idx on public.profiles(location_city);
create index films_search_idx on public.films using gin(search_document);
create index films_owner_idx on public.films(owner_id);
create index films_feed_idx on public.films(published_at desc,id) where status='published';
create index films_genres_idx on public.films using gin(genres);
create index films_film_asset_idx on public.films(film_asset_id);
create index films_hook_asset_idx on public.films(hook_asset_id);
create index films_poster_asset_idx on public.films(poster_asset_id);
create index credits_film_idx on public.film_credits(film_id);
create index credits_profile_idx on public.film_credits(profile_id);
create index credits_verifier_idx on public.film_credits(verified_by);
create index likes_film_idx on public.film_likes(film_id);
create index bookmarks_film_idx on public.film_bookmarks(film_id);
create index follows_following_idx on public.profile_follows(following_id);
create index blocks_blocked_idx on public.user_blocks(blocked_id);
create index conversations_high_idx on public.conversations(user_high);
create index participants_user_idx on public.conversation_participants(user_id);
create index messages_conversation_idx on public.messages(conversation_id,created_at desc,id);
create index messages_film_idx on public.messages(film_id);
create index reports_reporter_idx on public.content_reports(reporter_id);
create index reports_film_idx on public.content_reports(film_id);
create index reports_profile_idx on public.content_reports(profile_id);
create index reports_message_idx on public.content_reports(message_id);
create index assets_owner_idx on private.media_assets(owner_id,status);
create index events_film_idx on private.user_events(film_id);

-- Trusted helpers live in an unexposed schema, use fixed search paths and no user metadata authority.
create function private.is_blocked(p_other uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_blocks where (blocker_id=auth.uid() and blocked_id=p_other)
 or (blocked_id=auth.uid() and blocker_id=p_other)); $$;
create function private.is_member(p_conversation uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.conversations where id=p_conversation and auth.uid() in (user_low,user_high)
 and not private.is_blocked(case when user_low=auth.uid() then user_high else user_low end)); $$;
create function private.bootstrap_user() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 insert into public.profiles(id,handle) values(new.id,replace(new.id::text,'-',''));
 insert into private.user_state(user_id) values(new.id);
 return new;
 end; $$;
create trigger arcenray_user_created after insert on auth.users for each row execute function private.bootstrap_user();
insert into public.profiles(id,handle) select id,replace(id::text,'-','') from auth.users on conflict(id) do nothing;
insert into private.user_state(user_id) select id from public.profiles on conflict do nothing;

create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
 begin new.updated_at=now(); return new; end; $$;
create trigger profiles_updated before update on public.profiles for each row execute function private.touch_updated_at();
create trigger films_updated before update on public.films for each row execute function private.touch_updated_at();

-- Any editable film change returns it to draft; only the publish RPC can publish it.
create function private.guard_film_edit() returns trigger language plpgsql set search_path='' as $$
 begin
 if current_user in ('authenticated','anon') then new.status='draft'; new.published_at=null;
 new.film_key=null; new.hook_key=null; new.poster_key=null; new.duration_seconds=null; end if;
 return new; end; $$;
create trigger films_guard before update on public.films for each row execute function private.guard_film_edit();

alter table public.profiles enable row level security;
alter table public.films enable row level security;
alter table public.film_credits enable row level security;
alter table public.film_likes enable row level security;
alter table public.film_bookmarks enable row level security;
alter table public.profile_follows enable row level security;
alter table public.user_blocks enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.content_reports enable row level security;
alter table private.user_state enable row level security;
alter table private.media_assets enable row level security;
alter table private.entity_embeddings enable row level security;
alter table private.user_events enable row level security;

create policy profiles_read on public.profiles for select to anon,authenticated using
 (id=(select auth.uid()) or (onboarding_completed and not private.is_blocked(id)));
create policy profiles_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy films_read on public.films for select to anon,authenticated using
 (owner_id=(select auth.uid()) or (status='published' and not private.is_blocked(owner_id)));
create policy films_insert on public.films for insert to authenticated with check(owner_id=(select auth.uid()) and status='draft');
create policy films_update on public.films for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy credits_read on public.film_credits for select to anon,authenticated using(exists(select 1 from public.films f where f.id=film_id));
create policy credits_insert on public.film_credits for insert to authenticated with check
 (verification_state='pending' and verified_by is null and verified_at is null and exists(select 1 from public.films f where f.id=film_id and f.owner_id=(select auth.uid())));
create policy credits_delete on public.film_credits for delete to authenticated using
 (exists(select 1 from public.films f where f.id=film_id and f.owner_id=(select auth.uid())));
create policy likes_read on public.film_likes for select to authenticated using(user_id=(select auth.uid()));
create policy likes_insert on public.film_likes for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.films f where f.id=film_id and status='published'));
create policy likes_delete on public.film_likes for delete to authenticated using(user_id=(select auth.uid()));
create policy bookmarks_read on public.film_bookmarks for select to authenticated using(user_id=(select auth.uid()));
create policy bookmarks_insert on public.film_bookmarks for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.films f where f.id=film_id and status='published'));
create policy bookmarks_delete on public.film_bookmarks for delete to authenticated using(user_id=(select auth.uid()));
create policy follows_read on public.profile_follows for select to authenticated using(follower_id=(select auth.uid()));
create policy follows_insert on public.profile_follows for insert to authenticated with check(follower_id=(select auth.uid()) and not private.is_blocked(following_id) and exists(select 1 from public.profiles where id=following_id and onboarding_completed));
create policy follows_delete on public.profile_follows for delete to authenticated using(follower_id=(select auth.uid()));
create policy blocks_read on public.user_blocks for select to authenticated using(blocker_id=(select auth.uid()));
create policy blocks_insert on public.user_blocks for insert to authenticated with check(blocker_id=(select auth.uid()));
create policy blocks_delete on public.user_blocks for delete to authenticated using(blocker_id=(select auth.uid()));
create policy conversations_read on public.conversations for select to authenticated using(private.is_member(id));
create policy participants_read on public.conversation_participants for select to authenticated using(private.is_member(conversation_id));
create policy participants_update on public.conversation_participants for update to authenticated using(user_id=(select auth.uid()) and private.is_member(conversation_id)) with check(user_id=(select auth.uid()) and private.is_member(conversation_id));
create policy messages_read on public.messages for select to authenticated using(private.is_member(conversation_id));
create policy messages_insert on public.messages for insert to authenticated with check(sender_id=(select auth.uid()) and private.is_member(conversation_id) and (film_id is null or exists(select 1 from public.films where id=film_id and status='published')));
create policy reports_read on public.content_reports for select to authenticated using(reporter_id=(select auth.uid()));
create policy reports_insert on public.content_reports for insert to authenticated with check(reporter_id=(select auth.uid()) and status='open' and
 ((film_id is not null and exists(select 1 from public.films where id=film_id)) or
 (profile_id is not null and exists(select 1 from public.profiles where id=profile_id)) or
 (message_id is not null and exists(select 1 from public.messages where id=message_id))));

revoke all on all tables in schema public from anon,authenticated;
grant select on public.profiles,public.films,public.film_credits to anon,authenticated;
grant update(handle,full_name,bio,roles,location_city,skills_gear,onboarding_completed) on public.profiles to authenticated;
grant insert(owner_id,title,synopsis,genres,mood_tags,location_city,language,source,provider_id,film_asset_id,hook_asset_id,poster_asset_id),
 update(title,synopsis,genres,mood_tags,location_city,language,source,provider_id,film_asset_id,hook_asset_id,poster_asset_id) on public.films to authenticated;
grant insert(film_id,profile_id,display_name,role),delete on public.film_credits to authenticated;
grant select,delete on public.film_likes,public.film_bookmarks,public.profile_follows,public.user_blocks to authenticated;
grant insert(user_id,film_id) on public.film_likes,public.film_bookmarks to authenticated;
grant insert(follower_id,following_id) on public.profile_follows to authenticated;
grant insert(blocker_id,blocked_id) on public.user_blocks to authenticated;
grant select on public.conversations,public.conversation_participants,public.messages,public.content_reports to authenticated;
grant update(last_read_at) on public.conversation_participants to authenticated;
grant insert(conversation_id,sender_id,body,film_id,client_id) on public.messages to authenticated;
grant insert(reporter_id,film_id,profile_id,message_id,reason) on public.content_reports to authenticated;
grant all on all tables in schema public,private to service_role;

create function private.open_conversation(p_other_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare me uuid:=auth.uid(); cid uuid;
 begin
 if me is null or me=p_other_user or private.is_blocked(p_other_user) or not exists(select 1 from public.profiles where id=p_other_user and onboarding_completed) then raise exception 'Conversation not permitted' using errcode='42501'; end if;
 insert into public.conversations(user_low,user_high) values(least(me,p_other_user),greatest(me,p_other_user)) on conflict(user_low,user_high) do update set user_low=excluded.user_low returning id into cid;
 insert into public.conversation_participants(conversation_id,user_id) values(cid,me),(cid,p_other_user) on conflict do nothing;
 return cid;
 end; $$;
create function public.open_conversation(p_other_user uuid) returns uuid language sql set search_path='' as $$ select private.open_conversation(p_other_user); $$;

create function private.respond_to_credit(p_credit_id uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
 begin
 update public.film_credits set verification_state=case when p_accept then 'accepted' else 'declined' end,verified_by=auth.uid(),verified_at=now()
 where id=p_credit_id and profile_id=auth.uid() and exists(select 1 from public.films where id=film_id and owner_id<>auth.uid());
 if not found then raise exception 'Credit not permitted' using errcode='42501'; end if;
 end; $$;
create function public.respond_to_credit(p_credit_id uuid,p_accept boolean) returns void language sql set search_path='' as $$ select private.respond_to_credit(p_credit_id,p_accept); $$;

create function private.get_my_storage() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('quota_bytes',s.quota_bytes,
 'used_bytes',coalesce((select sum(actual_bytes) from private.media_assets where owner_id=auth.uid() and status in ('uploaded','ready')),0),
 'reserved_bytes',coalesce((select sum(expected_bytes) from private.media_assets where owner_id=auth.uid() and status='pending'),0))
 from private.user_state s where user_id=auth.uid(); $$;
create function public.get_my_storage() returns jsonb language sql stable set search_path='' as $$ select private.get_my_storage(); $$;

-- Upload reservations serialize on user_state. Expired reservations continue counting until
-- their R2 object is deleted by cleanup, preventing abandoned-upload quota bypass.
create function private.reserve_upload(p_kind text,p_bytes bigint,p_content_type text) returns jsonb language plpgsql security definer set search_path='' as $$
 declare me uuid:=auth.uid(); lim bigint; used bigint; asset private.media_assets;
 begin
 if me is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select quota_bytes into lim from private.user_state where user_id=me for update;
 if lim is null then raise exception 'Profile missing'; end if;
 select coalesce(sum(case when status='pending' then expected_bytes else actual_bytes end),0) into used from private.media_assets where owner_id=me and status in ('pending','uploaded','ready');
 if p_bytes<=0 or p_bytes+used>lim then raise exception 'Storage quota exceeded' using errcode='22023'; end if;
 if (p_kind='profile_picture' and p_bytes>102400) or (p_kind='poster' and p_bytes>524288) or (p_kind='hook' and p_bytes>52428800) then raise exception 'Asset too large' using errcode='22023'; end if;
 if (select count(*) from private.media_assets where owner_id=me and created_at>now()-interval '1 hour')>=30 then raise exception 'Upload rate limit' using errcode='54000'; end if;
 insert into private.media_assets(owner_id,kind,object_key,expected_bytes,content_type)
 values(me,p_kind,me::text||'/'||gen_random_uuid()::text,p_bytes,p_content_type) returning * into asset;
 return to_jsonb(asset);
 end; $$;
create function public.reserve_upload(p_kind text,p_bytes bigint,p_content_type text) returns jsonb language sql set search_path='' as $$ select private.reserve_upload(p_kind,p_bytes,p_content_type); $$;
create function private.get_my_asset(p_asset_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(a) from private.media_assets a where id=p_asset_id and owner_id=auth.uid(); $$;
create function public.get_my_asset(p_asset_id uuid) returns jsonb language sql stable set search_path='' as $$ select private.get_my_asset(p_asset_id); $$;

create function private.publish_film(p_film_id uuid) returns public.films language plpgsql security definer set search_path='' as $$
 declare f public.films; h private.media_assets; p private.media_assets; v private.media_assets;
 begin
 select * into f from public.films where id=p_film_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Film not permitted' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and onboarding_completed) then raise exception 'Complete onboarding first'; end if;
 select * into h from private.media_assets where id=f.hook_asset_id and owner_id=auth.uid() and kind='hook' and status='ready';
 select * into p from private.media_assets where id=f.poster_asset_id and owner_id=auth.uid() and kind='poster' and status='ready';
 if h.id is null or p.id is null or h.duration_seconds is null or h.duration_seconds>30 or h.duration_seconds<=0 then raise exception 'Verified hook and poster required'; end if;
 if f.source='r2_native' then
 select * into v from private.media_assets where id=f.film_asset_id and owner_id=auth.uid() and kind='film' and status='ready';
 if v.id is null then raise exception 'Verified film required'; end if;
 end if;
 update public.films set status='published',published_at=coalesce(published_at,now()),film_key=v.public_key,
 hook_key=h.public_key,poster_key=p.public_key,duration_seconds=v.duration_seconds where id=f.id returning * into f;
 return f;
 end; $$;
create function public.publish_film(p_film_id uuid) returns public.films language sql set search_path='' as $$ select private.publish_film(p_film_id); $$;

create function private.record_event(p_film_id uuid,p_kind text,p_idempotency_key uuid,p_watch_seconds numeric) returns void language plpgsql security definer set search_path='' as $$
 declare e extensions.vector(1536); t extensions.vector(1536); a real;
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
create function public.record_event(p_film_id uuid,p_kind text,p_idempotency_key uuid,p_watch_seconds numeric default 0) returns void language sql set search_path='' as $$ select private.record_event(p_film_id,p_kind,p_idempotency_key,p_watch_seconds); $$;

-- Discovery reads execute under RLS. Embedding scoring is a narrow private helper.
create function private.film_affinity(p_film uuid) returns double precision language sql stable security definer set search_path='' as $$
 select coalesce(1-(s.taste_vector operator(extensions.<=>) e.embedding),0) from private.user_state s cross join private.entity_embeddings e
 where s.user_id=auth.uid() and e.kind='film' and e.entity_id=p_film; $$;
create function private.has_consumed(p_film uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from private.user_events where user_id=auth.uid() and film_id=p_film and kind in ('film_complete','skip')); $$;
create function public.get_personalized_feed(p_limit integer default 20,p_offset integer default 0,p_genre text default null) returns setof public.films language sql stable set search_path='' as $$
 select f.* from public.films f where f.status='published' and not private.has_consumed(f.id) and (p_genre is null or p_genre=any(f.genres))
 order by coalesce(private.film_affinity(f.id),0) desc,f.published_at desc,f.id
 limit least(greatest(p_limit,1),50) offset least(greatest(p_offset,0),10000); $$;
create function private.semantic_score(p_kind text,p_id uuid,p_embedding extensions.vector(1536)) returns double precision language sql stable security definer set search_path='' as $$
 select greatest(0,1-(embedding operator(extensions.<=>) p_embedding)) from private.entity_embeddings where kind=p_kind and entity_id=p_id; $$;
create function public.hybrid_search(p_query text,p_kind text default 'all',p_city text default null,p_role text default null,p_genre text default null,p_limit integer default 20,p_embedding extensions.vector(1536) default null)
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

create function private.invalidate_embedding() returns trigger language plpgsql security definer set search_path='' as $$
 begin delete from private.entity_embeddings where kind=case when tg_table_name='films' then 'film' else 'profile' end and entity_id=new.id; return new; end; $$;
create trigger films_embedding_stale after update of title,synopsis,genres,mood_tags,location_city on public.films for each row execute function private.invalidate_embedding();
create trigger profiles_embedding_stale after update of full_name,bio,roles,skills_gear,location_city on public.profiles for each row execute function private.invalidate_embedding();

-- All function grants are explicit. Definer implementations are inaccessible through Data API.
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on all functions in schema public from public,anon,authenticated;
grant usage on schema private to anon;
grant execute on function private.is_blocked(uuid) to anon,authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_consumed(uuid),private.film_affinity(uuid),private.semantic_score(text,uuid,extensions.vector) to anon,authenticated;
grant execute on function private.open_conversation(uuid),private.respond_to_credit(uuid,boolean),private.get_my_storage(),private.reserve_upload(text,bigint,text),private.get_my_asset(uuid),private.publish_film(uuid),private.record_event(uuid,text,uuid,numeric) to authenticated;
grant execute on function public.open_conversation(uuid),public.respond_to_credit(uuid,boolean),public.get_my_storage(),public.reserve_upload(text,bigint,text),public.get_my_asset(uuid),public.publish_film(uuid),public.record_event(uuid,text,uuid,numeric) to authenticated;
grant execute on function public.get_personalized_feed(integer,integer,text),public.hybrid_search(text,text,text,text,text,integer,extensions.vector) to anon,authenticated;
grant execute on all functions in schema private,public to service_role;
-- Realtime applies table RLS to each subscriber.
alter publication supabase_realtime add table public.messages,public.conversation_participants;
