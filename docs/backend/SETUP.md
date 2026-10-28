# Backend setup and operations

See [current validation and pending setup](STATUS.md) before assuming a provider is ready.

## Services

- Supabase project `ropbxsnjtejfomnpdllf`, Mumbai, PostgreSQL17.
- Clerk web authentication, Supabase REST/RPC Data API and messages/participants Realtime publication.
- Cloudflare R2 `arcenray-uploads`: private incoming objects, no public domain.
- R2 `arcenray-media`: deliberately published assets at `https://cdn.arcenray.com`.
- Strict CORS allows localhost:3000, arcenray.com and www.arcenray.com only.
- Edge Functions: media-upload, index-entity, search, media-cleanup. Clerk JWT issuer/signature verification through the Data API inside user handlers. Cleanup additionally requires a dedicated operations secret; scheduled calls use a service-role JWT.

Migrations are ordered, versioned and matched to remote history. Do not blindly
reset or db push this shared project. Local Supabase requires Docker running.
No mobile app has been initialized; packages/shared is reusable from Expo later.

## Secrets

Real server values are in Supabase Edge Function secrets, never in Git or the UI.
`supabase/functions/.env.example` documents required names. R2 credential permissions
must include object read/write/delete on both named buckets, not all account resources.
The public project URL/publishable key in project.json is intentionally safe to share;
RLS controls access. Rotate credentials pasted into chat after setup, then update:

```sh
pnpm exec supabase secrets set --project-ref ropbxsnjtejfomnpdllf --env-file /path/to/private/backend.env
```

Never pass real secrets as command-line NAME=value arguments. Keep secret files out
of the checkout, chmod600, and delete temporary copies after use. Cleanup uses both the service-role JWT encrypted in Vault under
`arcenray_cleanup_service_role` and a dedicated operations secret
(`CLEANUP_SECRET` in Edge secrets / `arcenray_cleanup_secret` in Vault). Rotate the
corresponding Vault secret along with each server credential. Collaborators do not need it.

## Auth launch configuration

The current provider is Clerk. Follow [the authentication contract](../architecture/clerk-auth.md)
for keys, selected application, issuer trust, signup requirements and account migration.
The old Supabase callback URLs are retained for compatibility; the web callback no
longer exchanges PKCE codes. Never configure a legacy Clerk JWT template or share
Supabase signing secrets. Production Clerk/provider setup and end-to-end owner sign-in
remain launch checks. No frontend is deployed by this backend change.

## Deploy/update

```sh
pnpm exec supabase login
pnpm exec supabase link --project-ref ropbxsnjtejfomnpdllf
pnpm exec supabase db push --linked --dry-run
# Review migration + auth/RLS tests and obtain founder approval for shared DB changes.
pnpm exec supabase db push --linked
pnpm backend:types
npx deno check --config supabase/functions/deno.json supabase/functions/*/index.ts
pnpm exec supabase functions deploy --use-api --project-ref ropbxsnjtejfomnpdllf
```

Do not use config push against the entire generated local config without reviewing
config diff: local defaults are not the desired hosted project settings.
Use the reviewed per-function verify_jwt configuration: user handlers verify Clerk
through the Data API; cleanup retains gateway verification. Never remove handler auth. Keep shared types generated, not hand-authored.

## Validation

`pnpm test`, `pnpm lint`, `pnpm check-types`, `pnpm build` and Deno checks cover
contracts, SSR integration and bounded media metadata/sample inspection. Database
security assertions run transactionally, removing fixtures on completion:

```sh
pnpm exec supabase db query --linked --file supabase/tests/backend-security.sql
pnpm exec supabase db query --linked --file supabase/tests/media-lifecycle.sql
pnpm exec supabase db query --linked --file supabase/tests/recommendations.sql
```

Prefer a local/staging database. `scripts/backend-smoke.py` is an explicit live test:
it creates confirmed disposable users, signs them in, tests cross-user denials,
indexes through Supabase gte-small, uploads generated MP4/WebP fixtures straight to R2, verifies,
publishes, checks CDN Range delivery and removes its own users/objects in finally.
It requires Python3, FFmpeg, logged-in/linked Supabase CLI (for scoped private
embedding fixture cleanup), and server credentials in environment variables:
SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, R2_ACCOUNT_ID,
R2_ACCESS_KEY_ID,R2_SECRET_ACCESS_KEY,R2_BUCKET_NAME,R2_UPLOAD_BUCKET_NAME,R2_PUBLIC_URL.
With the root `.env.test` filled and Supabase CLI logged in, use `pnpm backend:smoke`.
The runner supplies default bucket names and obtains the server test key through the
existing CLI login if that local field is blank; it never prints keys. Run it only
with founder authorization. It prints no tokens or signed URLs. Embedding indexing and hybrid query inference must pass; no provider-blocked bypass
is accepted. Confirm cleanup output after failures.

## Cleanup and operational limits

The approved, enabled 15-minute cleanup job invokes service-only media-cleanup using an encrypted
Vault credential. It claims expired pending uploads, deleting them before releasing
quota; failed deletion keeps quota reserved for retry. It removes unattached verified
uploads older than one day, and private originals already safely copied to the CDN.
Attached film assets are excluded from abandoned-upload deletion. Published media
keys are immutable. CDN cache may retain an asset after origin deletion; takedown
needs deliberate origin deletion plus CDN cache purge by the founder.

The previously deployed web path imposed a 2GiB per-film cap. The current feature
branch replaces that fixed cap with resumable multipart sessions and a live worker
scratch-capacity admission check. Its database migration and FFmpeg worker journey
have not yet been applied and verified in production; do not promise large uploads
until that release gate passes. Server checks actual MP4/WebP metadata, codec
configuration, sample-table offsets, size/duration/dimensions; it does not fully
decode every frame or transcode video without the separate processing pipeline.

Search embeddings use Supabase Edge Runtime built-in `gte-small` (384 dimensions),
server-side only, with mean pooling and normalization. No external AI API key is needed.
English only; model input beyond 512 tokens is truncated. Structured metadata comes
before free text to retain roles/genres/location. Supabase runtime usage still applies.
Text edits and verified-credit changes invalidate old embeddings; call index-entity
afterward. No automatic indexing queue yet; retry 409/503 without blocking saved
content. Exact filters and full-text fallback remain available during inference outages.
Do not mix model vectors. Migration 20261016185726 refuses to run if old embedding
or taste rows exist; the current deployment had none. A populated deployment needs
an explicitly reviewed reset/reindex plan before applying that migration.

Rate limits: uploads30 intents/hour/user, media calls120/hour/user, indexing30/hour,
semantic searches60/hour, events60/minute and one taste update/film/kind/day. Database
writes have RLS/field constraints; a full abuse/moderation admin UI, notifications,
private draft sharing, account/media deletion workflows and production monitoring
are not implemented. Do not open public onboarding before the founder reviews these.

Clerk live smoke: `pnpm backend:smoke --clerk` (founder test credentials only).
It creates and cleans disposable accounts/media; never run against production blindly.
