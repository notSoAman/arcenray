# Backend validation status — 2026-10-16

## Deployed

- Supabase schema: 11 public application tables plus private quota/media/embedding/event/rate-limit state.
- RLS, column grants, ownership/publish/credit/conversation RPCs; generated TypeScript types.
- Realtime publication: messages and conversation_participants.
- Edge Functions: media-upload, index-entity, search, media-cleanup (JWT verified).
- Server-side R2/OpenAI secrets installed.
- Private arcenray-uploads bucket; public arcenray-media bucket with active CDN SSL.
- Founder-approved CORS rules installed for localhost:3000, arcenray.com and www.arcenray.com.
- Next.js SSR clients, secure PKCE callback and session-refresh proxy prepared in Git.

## Verified

- Live disposable Auth users, automatic profile creation, profile edits and draft privacy.
- Live one-to-one chat persistence/access; third-party reads and sender impersonation denied.
- Full-text fallback while OpenAI embeddings are unavailable.
- Database security assertions passed with fixture rollback.
- 14 local contract/media parser tests; Edge Deno typechecks; repository lint/types/build.
- Supabase security advisor: zero findings. Performance advisor only reports unused
  indexes expected on a new project with no application data.

## Pending external action

1. The supplied R2 S3 credential can access arcenray-media but receives403 on
   arcenray-uploads. Grant object read/write/delete on both buckets (or replace the
   Edge Function R2 credentials with a key scoped to both). The signed-upload endpoint
   works, but the actual private-bucket PUT was denied. Complete upload/publication/
   CDN playback and cleanup e2e verification is therefore pending.
2. OpenAI returns429 `credit_balance_exhausted` / `insufficient_quota`. Add project
   credit before semantic indexing and recommendation quality can be verified.
3. Automatic approval review requires specific founder approval for the proposed
   three auth callback URLs and15-minute cleanup schedule. Those remote changes are
   not enabled yet; the scheduled_cleanup migration is prepared but unapplied.
4. Google OAuth credentials, production SMTP/deliverability, a deployed frontend,
   pilot moderation/account/media deletion UX and private presence need later setup.

All disposable users from live tests were removed. No credentials are committed.
The backend feature branch is for review; it has not been merged into the default branch.
