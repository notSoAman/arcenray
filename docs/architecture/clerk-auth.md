# Clerk authentication and public browsing — owner-approved 2026-10-17

TASK: replace web sign-in with Clerk and allow guests to browse published work.
OWNER: founder + Codex now owns frontend and backend through launch; preserve the
accepted design from merged PR #4. Branch: codex/clerk-public-browsing.

## Contract

- Clerk is the new web identity provider: Google, Apple, email, phone and username
  are requested identifiers/providers. Availability depends on the selected Clerk
  application's configuration and provider credentials. Do not create another
  accountless application. CLI login completed; the existing application is linked.
- Supabase still owns relational data, RLS, Realtime and trusted Edge Functions.
  Use native third-party auth with Clerk session tokens (no legacy JWT template or
  sharing the Supabase signing secret).
- Public entity/profile UUIDs remain unchanged. Private identity mapping binds a
  trusted JWT issuer + subject to a UUID. Never cast Clerk user IDs to UUID, accept a
  caller's profile ID as authority, or link existing accounts merely by email.
- `public.current_profile_id()` returns UUID|null; `public.ensure_current_profile()`
  transactionally creates a pending profile/identity/quota row for the verified
  current Clerk subject. Trusted issuers are configured server-side only.
- Two existing Supabase accounts are retained, with their UUIDs and data. Legacy
  Supabase tokens continue to work during migration; only a server-side verified
  migration can attach a Clerk subject to an existing profile. No forced deletion,
  automatic email linking or silent ownership reassignment. Legacy cutoff happens
  after both accounts are migrated and the Clerk flow is verified.
- `createArcenrayClient(...).viewer.id()` resolves the application's UUID or null.
  Existing SDK identifiers, DTOs and getViewer().user.id remain UUIDs.
- Browser and SSR Supabase clients obtain Clerk tokens via `accessToken` callbacks.
  SDK `supabase.auth.getUser()` is not a Clerk identity resolver.
- Edge user handlers authorize through a token-authenticated database RPC: Supabase
  verifies the JWT issuer/signature before resolving identity. They fail closed
  before service-role work. Clerk tokens need handler verification rather than the
  legacy HS256 gateway check; media-cleanup retains its existing gateway + dedicated
  secret. No authenticated action is made public by this change.

## Guests

Home/discover/search, published film detail/watch and completed public creator
profiles work without login. Guest search uses the RLS-backed full-text RPC (no
unlimited public embedding inference). Drafts, unfinished profiles, private media,
messages, follows, bookmarks, likes, reports, upload and profile editing remain
protected. Guest interaction controls route to sign-in and return to their content.
Do not emit personalization events for guests. Signup/onboarding is not a prerequisite
for reading public content. Server RLS remains the authority, not hidden buttons.

## Acceptance and scope

Touch web auth/data adapters, page auth guards/action prompts, shared identity
resolution, versioned identity/RLS migration, function auth, tests and docs. No new
backend platform, new visual system, monetization, deployment/paid upgrade or account
sharing. Validate wrong issuer/forged tokens, cross-user writes, guessed conversation
IDs, guest read/write boundaries, profile bootstrap races, legacy UUID continuity,
server/client sign-in and callback/redirect safety. Regenerate types after migration.

Clerk login/keys, Supabase third-party provider trust, provider setup, two-account
migration and production verification must be recorded as actual verification or
remaining blockers, never claimed from SDK installation alone.

## Verified development setup

- Selected application `app_3KbaRFRlbAzVcY92i69x6LttYRK`; development issuer
  `https://growing-burro-9418.clerk.accounts.dev` registered in Supabase native
  third-party authentication. Session claims include `role: authenticated`.
- Google and Apple are enabled. The rendered sign-in widget exposes both, email /
  username, and the phone option. Actual provider sign-in and real SMS delivery have
  not been tested. Production provider credentials/domains remain launch work.
- Founder approved optional phone at signup; phone login stays available. Email,
  username and password requirements remain, including verification and breach checks.
  The broader optional-username/password relaxation was rejected and not applied.
- Local `apps/web/.env.local` holds the public Clerk key and server-only secret,
  is ignored and chmod 600. `pnpm setup:web` preserves existing files; obtain Clerk
  keys securely for another trusted development machine. Root `.env.test` is for
  founder backend operations and must not be shared with frontend collaborators.
- The identity migration is applied and generated types match it. User functions
  media-upload, search and index-entity are deployed with JWT checks performed by
  the Supabase Data API inside their handlers. Their legacy gateway check is off;
  media-cleanup keeps its gateway check and dedicated operations secret.
- All four transactional SQL suites, 21 repository tests, lint, types, build and
  four Deno entrypoint checks passed. `pnpm backend:smoke --clerk` passed with three
  disposable Clerk users: media publication/playback, indexing/search, event feed,
  chat/cross-user denials and public guest film/profile reads with private data denied.
- Guest home, search, phone sign-in UI and chat sign-in redirect were browser-verified; empty catalog renders an honest empty state.
  Missing and forged tokens returned 401 from all three deployed user functions.
  This is development validation, not a production deployment or launch approval.

## Existing account migration

`scripts/migrate-supabase-users-to-clerk.mjs` defaults to a counts-only dry run.
Applying requires explicit founder approval to transfer email addresses, bcrypt
password hashes and profile IDs to the selected Clerk development application:

```sh
node scripts/migrate-supabase-users-to-clerk.mjs
node scripts/migrate-supabase-users-to-clerk.mjs --apply --expected-count 2
```

It preserves email verification state, imports hashes without plaintext, links by
trusted external ID, refuses email collisions and retains original accounts.
Non-email providers require manual reconciliation. Never run against another
instance or publish sensitive output. Legacy Supabase sign-in is a temporary
compatibility path; disabling it needs a reviewed cutoff after owner sign-in testing.

## Local DNS workaround

This machine's local resolver delayed Node requests to Supabase beyond the fetch
connection timeout. A process-scoped workaround verified successful requests:
`RES_OPTIONS='attempts:1 timeout:1' pnpm --filter web dev`.
No OS resolver, TLS or Cloudflare protections were changed. This is not a required
production setting.

## Remaining launch checks

Configure a Clerk production instance, real provider credentials, approved domains,
email/SMS delivery and rate/cost limits; test actual Google/Apple/phone flows and
existing-user password sign-in. Register that production issuer separately through
reviewed configuration. Supabase's advisor flags legacy Auth leaked-password
protection as disabled; Clerk password breach checks are enabled. Do not claim the
legacy advisor warning resolved or enable paid services without approval.

## Existing-account result — 2026-10-17

Founder approved importing both accounts' email addresses, bcrypt hashes and profile
IDs, then separately approved optional phone at signup. Both imports and private
identity links completed; original profile UUIDs and legacy accounts are retained.
One email stays verified and one stays unverified/reserved. Plaintext passwords
were neither requested nor stored. Founder subsequently confirmed real sign-in works (2026-10-17). Individual production provider flows remain launch checks.

`pnpm backend:auth-check` is a read-only deployed-function check that rejects both
missing and forged tokens for media-upload, index-entity and search (HTTP 401).
