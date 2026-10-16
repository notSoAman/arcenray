# Backend validation status — 2026-10-17

## Connected and deployed

- Supabase project `ropbxsnjtejfomnpdllf`: schema, RLS, column grants and API/RPCs.
- Realtime publication: messages and conversation_participants.
- Six ordered migrations applied, including the dedicated cleanup authentication fix.
- Four JWT-protected Edge Functions: media-upload, index-entity, search, media-cleanup.
- Credentials from the Git-ignored root `.env.test` synced to server-side secrets.
- R2 `arcenray-media` and private `arcenray-uploads`; supplied S3 key verified on both.
- `cdn.arcenray.com` attached with active ownership/SSL and TLS1.2 minimum.
- Approved origin-specific CORS and auth callback URLs installed.
- Approved15-minute cleanup schedule resumed. Operations secret is encrypted in Vault
  and stored in Edge secrets; incorrect secret is rejected.
- Next.js SSR clients, PKCE callback, session proxy, shared SDK and frontend handoff in Git.

## Verified

- Full live flow: Auth -> profile -> draft -> direct R2 upload -> actual MP4/WebP
  inspection -> profile image -> publication -> JavaScript CDN206 Range + origin CORS.
- Chat persistence and participant access; third-user reads and impersonation denied.
- Event ingestion and completed-film feed filtering.
- Full-text fallback while OpenAI embeddings are unavailable.
- Database authorization and media-lifecycle transaction tests with fixture rollback.
- Real FFmpeg MP4/WebP fixtures plus14 local contract/parser tests.
- Cleanup authentication-only check: incorrect secret401, valid secret200, no deletion.
- First observed natural cleanup run after the fix returned HTTP200 with no timeout.
- Synthetic-vector SQL tests passed for hybrid ranking, taste updates and deduplication.
- Repository lint/types/build and Edge Deno typechecks.
- Supabase security advisor previously reported zero findings; checked again after setup.

The media smoke test now uses JavaScript fetch, matching the frontend runtime.
The Python HTTP transport received403 for media while JavaScript returned206 for
that same server-copied MP4; no Cloudflare security protections were disabled.
All disposable live-test users and objects were removed.

## Remaining setup

- OpenAI returns429 `credit_balance_exhausted` / `insufficient_quota`. Add credits
  before semantic indexing/quality can be verified. Full-text discovery remains usable.
- Google OAuth credentials, production SMTP/deliverability, deployed frontend,
  pilot moderation/account/media deletion UX and private presence are later work.
- The backend PR is for review and has not been merged into the default branch.
