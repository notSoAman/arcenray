# Backend foundation contract

Scope: profiles/onboarding, films and verified credits, discovery/search, likes/bookmarks,
private one-to-one chat, reports/blocks, quota-reserved R2 uploads. No stories,
general social posts, hiring marketplace, payments, or mobile UI.

Supabase Auth + RLS-backed Data API are the API; do not add a competing API server.
Public schema tables: profiles, films, film_credits, film_likes, film_bookmarks,
profile_follows, user_blocks, conversations, conversation_participants, messages,
content_reports. Private schema: user_state (quota/taste), media_assets, entity_embeddings,
user_events. Private data is not exposed through PostgREST.

All IDs are UUIDs. All timestamps UTC. Profile id = auth.users.id.
Profiles: handle (lowercase), full_name, bio, roles[], location_city, skills_gear[],
profile_pic_key, onboarding_completed. Films: owner_id, title, synopsis, genres[],
mood_tags[], location_city, language, source (r2_native/vimeo_embed/youtube_embed),
provider_id, status (draft/published/archived), film_asset_id, hook_asset_id,
poster_asset_id, duration_seconds, published_at. Public reads include only completed
profiles and published films; owners can see their pending profile and drafts.

Public RPCs (all invoked with user JWT except public discovery/search):

- get_personalized_feed(p_limit=20, p_offset=0, p_genre=null): films rows.
- hybrid_search(p_query, p_kind='all', p_city=null, p_role=null, p_genre=null,
  p_limit=20): {id,kind,title,summary,score} rows. Full-text fallback when embeddings unavailable.
- open_conversation(p_other_user): UUID (idempotent per pair).
- publish_film(p_film_id): film row; requires verified ready media.
- respond_to_credit(p_credit_id,p_accept): void; only credited user can attest.
- record_event(p_film_id,p_kind,p_idempotency_key,p_watch_seconds=0): void.
- get_my_storage(): {quota_bytes,used_bytes,reserved_bytes}.

Edge Functions:

- media-upload POST {action:'create',kind:'film'|'hook'|'poster'|'profile_picture',
  bytes,content_type} -> {asset_id,upload_url,expires_at,headers}; PUT bytes directly to R2.
  POST {action:'complete',asset_id} -> verified asset status (uploaded/private).
  POST {action:'publish',film_id} -> promotes verified media and publishes the film.
- index-entity POST {kind:'film'|'profile',id}: owner-only embedding refresh.
- search POST {query,kind?,city?,role?,genre?,limit?}: hybrid search with optional query embedding.

Media stays pending until server-side validation. A claimed MIME/duration does not
prove a valid video. Media verification must parse actual bytes before publication.
Never make pending assets public. The existing public R2 bucket is for published
assets only; incoming uploads use a separate private bucket.

Frontends use packages/shared typed SDK; generated database.types.ts is authoritative.

Applied follow-up tables: private.api_usage. Ops-only backend_* RPCs are service-role-only, not frontend APIs. Complete film media stays private until an explicit publish action.
