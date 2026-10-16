# Arcenray

Creator-first filmmaking and music collaboration. Read [AGENTS.md](AGENTS.md) before making changes; Claude Code starts with [CLAUDE.md](CLAUDE.md).

## Start the frontend

Requires Node.js 24+ and pnpm 11.25.0. Until the backend PR is merged, clone/check out `codex/backend-foundation`.

```sh
pnpm install --frozen-lockfile
pnpm setup:web
pnpm --filter web dev
```

Open http://localhost:3000. The current pages are the original Next.js scaffold;
UI implementation is the next task. Setup writes public project configuration to
the ignored `apps/web/.env.local` and preserves any existing file. Your friend
needs repository access, not R2 or service-role credentials.

## Backend

Supabase provides authentication, the RLS-backed REST/RPC API, and Realtime chat.
Edge Functions handle signed R2 upload intents, media inspection, publication,
embedding indexing and semantic search. R2 uploads go straight to a **private**
bucket; explicit publication copies verified objects server-side to the CDN bucket.

- [Live validation status and pending provider setup](docs/backend/STATUS.md)
- [Frontend integration and API examples](docs/backend/FRONTEND_HANDOFF.md)
- [Setup, deployment, operations and known limits](docs/backend/SETUP.md)
- [Database/API contract](docs/architecture/backend-contract.md)
- [Applied migrations](supabase/migrations)
- [Generated types and shared SDK](packages/shared/src)
- [Frontend design reference](https://claude.ai/artifact/5wapxcaa1Em9CVdM23kAW6)

Stories, general social posts, hiring marketplace and payments are outside this foundation.

## Checks

```sh
pnpm test
pnpm lint
pnpm check-types
pnpm build
npx deno check --config supabase/functions/deno.json supabase/functions/*/index.ts
```

Database authorization tests are in `supabase/tests/backend-security.sql` and roll
back their fixtures. The live smoke test creates disposable users and media:
see SETUP before running it against a shared project. Never commit credentials.
