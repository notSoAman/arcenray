# Initial Cloudflare pilot — 18 October 2026

Owner: Aman Singh Choudhary + Codex. Branch: `codex/production-readiness`, PR7.
This is a controlled pilot using the existing Supabase project, not an isolated
production environment or a claim that every wider release gate is complete.

## Approved destinations and identity

- Cloudflare Worker: `arcenray-web`; staging: `https://staging.arcenray.com`.
- Founder approved serving `arcenray.com/*` after staging checks pass, preserving
  the separate existing policy routes and the CDN/Clerk/accounts subdomains.
- Supabase shared pilot: `ropbxsnjtejfomnpdllf`; existing data and identity mappings retained.
- Clerk production instance: `ins_3KsKWRoqHBRWlVrmKzya2JxBj8L`,
  exact issuer `https://clerk.arcenray.com`. Native Supabase trust and the versioned
  private issuer allowlist are configured; role claim is `authenticated`.
- Clerk reports DNS, SSL, mail and Google configuration complete. Apple and phone/SMS
  authentication are disabled for launch by founder decision. No plan was purchased.
- The production `user.deleted` webhook targets `/api/webhooks/clerk`, exclusively
  filtered to that event. Its signing secret is in Cloudflare server secrets.
- Development cleanup keys remain separate; exact issuer selection chooses the
  production key for production deletion jobs. Unknown/ambiguous issuers fail closed.
- Production identities are not automatically linked to existing UUIDs by email.
  Founder moderator access remains on the original `test_aman` UUID; linking a new
  production founder identity needs explicit verification and approval.

## Verification completed

- 45 repository tests, lint, types; 54 Edge tests and Edge type checks passed.
- All twelve transactional SQL suites passed; final copy/issuer migrations were
  separately rollback-tested against affected lifecycle/security suites before apply.
- Next.js 16.4.1 + OpenNext Cloudflare1.20.12 build and dry-run passed. Compressed
  Worker size approximately2.5MiB; actual startup reported23–30ms for this artifact.
  These are measurements for this build, not ongoing performance guarantees.
- Hosted SSR headers, per-request nonces, guest rendering, unauthenticated deletion
  boundaries and unsigned webhook denial passed on the Worker and staging domain.
- A correctly signed synthetic deletion for an unknown identity returned200 without
  creating or deleting an account. Real provider webhook delivery remains a separate
  operational check; this probe does not claim Svix delivered an actual deletion.
- Production Clerk UI renders Google/email/username on staging. Live keys intentionally
  fail on workers.dev; use the approved staging subdomain for browser verification.
- Real generated87MiB multipart film: connection loss after the first R2 part,
  new task/reselection and full-content fingerprint, canonical stored-part recovery,
  same quota reservation, trusted MP4 verification, publish and CDN206 all passed.
- That test confirmed source/public ETags differ. The final fix records CopyObject
  destination ETags only after matching HEAD size/MIME/ETag, checkpoints quarantine
  and restore under a live versioned lease, and retains the original source identity.
- Real takedown removed all three QA CDN URLs (404); restoration returned206 and
  public film visibility. Ordinary PUT duplicates remain tracked until signatures expire.

The disposable QA manifest is `/tmp/arcenray-multipart-manifest.json`, private and
outside Git. It records one account, one film and three generated assets. Exact
cleanup completed: no QA media/account jobs or assets remain; signed R2 listing confirmed
the private prefix empty and all three public objects and quarantine backups absent.
The two ordinary PUT cleanup deadlines were accelerated only for these exact fixtures
after their ten-minute signatures had expired for over fifteen minutes.

## Deployment and rollback

Build with the selected private production environment supplied as process environment;
Next.js `.env.local` otherwise takes precedence over `.env.production.local`. Never
commit or print either file. Browser assets must contain only public identifiers.

Deploy through the checked-in `apps/web/wrangler.jsonc`, preserving secrets. The policy
site's more specific routes continue to serve `/privacy`, `/terms` and `/policy-assets/*`.
Do not remove those until the full app policy pages and assets are verified after cutover.
Record the final Worker version, Git commit, hosted smoke results and any limitations.

Rollback the web using Cloudflare versions or remove only the new apex route to return
traffic to its prior origin; keep policy routes intact. Do not roll back by dropping
tables, resetting the database or deleting user content. Database and R2 recovery
procedures require separate reviewed operations.

## Remaining limits

This pilot shares development data and does not establish a separate production backup
or recovery drill. Mobile release, physical-device large-upload testing, independently
reviewed policy/retention decisions, operational alerting and comprehensive disaster
recovery remain wider launch work. OpenNext marks Node middleware support experimental;
preserve nonce/auth regression checks on upgrades. The founder confirmed a real production Google callback reached onboarding on staging.
Google audience publication remains a separate account setting.

## Pilot cutover completed

- Staging version: `09413f8c-d365-400c-a917-a360e3901872`.
- Live apex version: `8a25981d-18d7-4a81-8b78-89e5e572e31f`.
- Live root, Loop, search, sign-in, test_aman profile, privacy and terms returned HTTP200.
- Live security suite passed unique SSR nonces, headers, guest home, denied deletion
  requests and unsigned webhook denial. Browser confirmed the public landing page renders.
- Existing policy-specific routes and all unrelated subdomains were preserved.
- No paid plan was purchased. The founder confirmed Google sign-in on staging before cutover.
