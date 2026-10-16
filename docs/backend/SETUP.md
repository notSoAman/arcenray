# Backend setup and operations

See [current validation and pending setup](STATUS.md) before assuming a provider is ready.

## Services

- Supabase project `ropbxsnjtejfomnpdllf`, Mumbai, PostgreSQL17.
- Supabase Auth, REST/RPC Data API and messages/participants Realtime publication.
- Cloudflare R2 `arcenray-uploads`: private incoming objects, no public domain.
- R2 `arcenray-media`: deliberately published assets at `https://cdn.arcenray.com`.
- Strict CORS allows localhost:3000, arcenray.com and www.arcenray.com only.
- Edge Functions: media-upload, index-entity, search, media-cleanup. JWT verification
  enabled; handlers additionally verify users with Auth. Cleanup is service-role only.

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
of the checkout, chmod600, and delete temporary copies after use. Cleanup uses the
service-role JWT encrypted in Vault under `arcenray_cleanup_service_role`; rotate that
Vault secret as well when rotating the service-role JWT. Collaborators do not need it.

## Auth launch configuration

Proposed callback allowlist (remote approval pending): http://localhost:3000/auth/callback,
https://arcenray.com/auth/callback, https://www.arcenray.com/auth/callback.
Current Site URL remains localhost for development. Change it to the approved deployed
web host for launch. Email confirmation remains enabled. Google OAuth requires the
founder's Google client credentials and provider configuration. Production email
requires SMTP setup/deliverability testing; built-in Auth email delivery is not a
production email service. No frontend is deployed by this backend change.

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
Do not deploy with --no-verify-jwt. Keep shared types generated, not hand-authored.

## Validation

`pnpm test`, `pnpm lint`, `pnpm check-types`, `pnpm build` and Deno checks cover
contracts, SSR integration and bounded media metadata/sample inspection. Database
security assertions run transactionally, removing fixtures on completion:

```sh
pnpm exec supabase db query --linked --file supabase/tests/backend-security.sql
```

Prefer a local/staging database. `scripts/backend-smoke.py` is an explicit live test:
it creates confirmed disposable users, signs them in, tests cross-user denials,
indexes through OpenAI, uploads generated MP4/WebP fixtures straight to R2, verifies,
publishes, checks CDN Range delivery and removes its own users/objects in finally.
It requires Python3, FFmpeg and server credentials in environment variables:
SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, R2_ACCOUNT_ID,
R2_ACCESS_KEY_ID,R2_SECRET_ACCESS_KEY,R2_BUCKET_NAME,R2_UPLOAD_BUCKET_NAME,R2_PUBLIC_URL.
Run it only with founder authorization. It prints no tokens or signed URLs. Examine
provider BLOCKED lines: a passing core-media check does not prove semantic indexing
when OpenAI credits are exhausted. Confirm cleanup output after failures.

## Cleanup and operational limits

The prepared (approval-pending) 15-minute cleanup job invokes service-only media-cleanup using an encrypted
Vault credential. It claims expired pending uploads, deleting them before releasing
quota; failed deletion keeps quota reserved for retry. It removes unattached verified
uploads older than one day, and private originals already safely copied to the CDN.
Attached film assets are excluded from abandoned-upload deletion. Published media
keys are immutable. CDN cache may retain an asset after origin deletion; takedown
needs deliberate origin deletion plus CDN cache purge by the founder.

The initial 2GiB film limit uses a single direct PUT; multipart/resumable uploads are
not implemented. Conversion/compression and hook selection are frontend work.
Server checks actual MP4/WebP metadata, codec configuration, sample-table offsets,
size/duration/dimensions; it does not fully decode every frame or transcode video.
A dedicated transcoding/decoding pipeline is future work if device support requires it.

Search embeddings use text-embedding-3-small1536 and are private. Text edits and
verified-credit changes invalidate old embeddings; call index-entity afterward.
No automatic indexing queue yet; the client must retry on 409/503 without blocking
saved content. OpenAI currently reports exhausted credits; add credit before checking
semantic quality. Exact filters and full-text fallback work without OpenAI.

Rate limits: uploads30 intents/hour/user, media calls120/hour/user, indexing30/hour,
semantic searches60/hour, events60/minute and one taste update/film/kind/day. Database
writes have RLS/field constraints; a full abuse/moderation admin UI, notifications,
private draft sharing, account/media deletion workflows and production monitoring
are not implemented. Do not open public onboarding before the founder reviews these.
