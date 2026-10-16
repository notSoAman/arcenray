# Frontend handoff for Claude Code

Read root AGENTS.md and the design reference first. The design has welcome,
following/discovery feeds, search, film/player, creator profiles, inbox and threads.
Use its visual language; do not implement stories or copy every social feature.
Projects/places tabs, matching logic, general BTS posts and marketplace workflows
are not backend contracts. Design those later with the founder.

## Clone setup

```sh
pnpm install --frozen-lockfile
pnpm setup:web
pnpm --filter web dev
```

Use the backend foundation feature branch until its PR is merged. Public connection
settings live in `project.json`. Never request the founder's service-role/R2
keys. Tests and account creation for development should use a staging/local project
when possible; the configured hosted project is shared.

## Clients and sign-in

Browser: `apps/web/lib/supabase/client.ts`. Server Components / Route Handlers:
`apps/web/lib/supabase/server.ts`. The proxy refreshes cookie sessions; `/auth/callback`
exchanges PKCE codes and rejects external redirect targets. Protected pages still
need an authenticated user check; RLS is always the authorization boundary.

```ts
import { createClient } from "@/lib/supabase/client"; // adjust alias to web tsconfig
import { createArcenrayClient } from "@repo/shared";
const supabase = createClient();
const api = createArcenrayClient(supabase);
await supabase.auth.signInWithOtp({
  email,
  options: { emailRedirectTo: `${location.origin}/auth/callback` },
});
// Google uses signInWithOAuth only after founder configures provider credentials.
```

Always handle `{data,error}` from Supabase; a fulfilled Promise does not imply
success. Function errors return an error response; preserve drafts and offer retry.
No real UI routes or screens were replaced by the backend work.

## Profiles and films

Auth automatically creates a pending profile with a unique UUID-derived handle.
Complete `api.profiles.update` with handle, full_name, bio, roles[], location_city,
skills_gear[], onboarding_completed:true. Public profiles exclude quota and taste
vectors. `roles` supports multiple creative roles.

Create drafts with `api.films.createDraft`. Public reads include only published
films. Owners see drafts. Film status, trusted durations, media keys and verified
credits cannot be set by a client. Editing published metadata returns it to draft;
republish explicitly. Public media already distributed through the CDN is not
revoked by changing draft metadata; private/unpublish delivery is a separate feature.

## Upload -> verify -> publish

1. Compress/export the actual Blob before requesting an upload intent.
2. `api.media.create({kind,bytes:blob.size,content_type:blob.type})`.
3. PUT that same Blob directly to `data.upload_url`, using `data.headers`. The
   browser computes Content-Length; do not set it manually. A different length
   invalidates the signature. Signed URL lifetime is ten minutes.
4. `api.media.complete(data.asset_id)`. Verification reads the actual R2 object,
   checks size/type, WebP dimensions or H.264/AAC MP4 metadata and sample tables.
5. Save film_asset_id, hook_asset_id and poster_asset_id in the draft. For linked
   Vimeo/YouTube films use a provider ID, no native film_asset_id, plus your own hook/poster.
6. `api.films.publish(filmId)` invokes media-upload's publish action. It performs
   an R2 server-side copy and then the publish RPC. Do not call publish_film directly
   for unpromoted media. Profile-picture completion updates profile_pic_key itself.
7. `api.index('film',filmId)` after changes; `api.index('profile',userId)` after
   onboarding/profile edits. Index errors must not hide a successfully saved film.

Render public keys as `https://cdn.arcenray.com/${key}`. Native player supports
HTTP Range. External films use compliant Vimeo/YouTube embeds from validated IDs;
never scrape/download them. Hook <=30s and <=720p; film <=1080p; WebP profile <=256²;
poster <=800x1200. Upload caps: hook50MiB, profile100KiB, poster512KiB, film2GiB.
Total per-account quota is 2GiB and includes pending reservations.

## Discovery and search

`api.films.feed(20,offset,genre)` returns RLS-filtered published films with personal
vector ranking when available; recency fallback otherwise, excluding completed/skipped
films for that user. `api.search({query,kind:'all'|'film'|'profile',city?,role?,genre?})`
returns `{results,mode:'hybrid'|'full_text'}`. The public `hybrid_search` RPC also
works without a query embedding for full-text-only searches. Respect exact filters.
Embeddings use Supabase built-in gte-small: English only, 384 dimensions, maximum
512 input tokens. Longer text is truncated. Full-text fallback handles inference outages.

`api.events.record({film_id,kind,idempotency_key,watch_seconds})` accepts hook_watch,
film_complete, like, bookmark, skip. Reuse a UUID on retries. Taste updates are bounded
and deduplicated. Use explicit consent-aware meaningful events, not per-frame telemetry.

Likes/bookmarks/follows are simple RLS-protected tables; for example:

```ts
const {
  data: { user },
} = await supabase.auth.getUser();
await supabase.from("film_bookmarks").insert({ user_id: user!.id, film_id });
await supabase.from("film_bookmarks").delete().eq("film_id", film_id);
```

## Chat, credits and reports

`api.chat.open(otherUserId)` returns the same conversation for the same pair.
`api.chat.messages(id)` reads the latest50 (reverse for chronological display).
`api.chat.send({conversation_id,body,client_id,film_id?})` binds sender to the session.
Use a stable client_id UUID to deduplicate retries. Query conversations and participants
for the inbox; update only your participant's last_read_at after rendering messages.

```ts
const channel = supabase
  .channel(`messages:${conversationId}`)
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: `conversation_id=eq.${conversationId}`,
    },
    ({ new: message }) => {
      /* merge by id/client_id */
    },
  )
  .subscribe();
// Unmount: supabase.removeChannel(channel)
```

Database RLS restricts every Realtime event to participants. Arbitrary membership,
sender impersonation and reading other conversations are denied. Blocking either
party hides/stops that conversation. Typing/presence private channel authorization
is not implemented; don't send private payloads through unrestricted Broadcast.

Creators insert pending film_credits. Only the named registered collaborator can
accept/decline via `api.credits.respond`; creator self-verification is forbidden.
Show pending/accepted/declined distinctly. Creator may remove a credit.

Insert `content_reports` with reporter_id, reason and exactly one of film_id,
profile_id,message_id. User sees only their reports; admin moderation is a founder
operation. `user_blocks` accepts blocker_id=current user and blocked_id=target.
No admin dashboard or fabricated moderation completion is included.
