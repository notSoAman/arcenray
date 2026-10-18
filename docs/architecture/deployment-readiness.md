# Website deployment readiness

Owner: founder + Codex. Updated 2026-10-18. This is a release checklist, not a record
of a completed deployment. See [production-readiness.md](production-readiness.md)
and the implementation-specific verification documents for actual evidence.

## Separate preparation from release

Code, migrations and a successful local build prepare a release. A verified staging
site, correct production credentials, recovery drill and founder approval permit
release. Hosting remains undecided: do not provision a service or change DNS from
this document alone. Choose a host supporting the actual Next.js server features;
this application is not a static HTML export. [Next.js hosting guidance](https://nextjs.org/docs/app/guides/self-hosting).

Record the selected host, region, domain, release commit, backend project, Clerk
instance and R2 bucket pair before deployment. Use a separate staging environment
where possible. A preview connected to the shared development database is not an
isolated environment and must be described honestly.

## Hosting decision still required

Prepare Vercel as the first option to evaluate for native Next.js compatibility,
not as an approved purchase or completed deployment. Vercel Hobby is restricted to
personal, non-commercial use; a startup project must not assume it qualifies merely
because the MVP has no payments or ads. Review the appropriate plan and budget with
the founder. [Vercel Hobby terms](https://vercel.com/docs/plans/hobby).

Cloudflare Workers is an alternative through the OpenNext adapter. Before selecting
it, verify support for this repository's exact Next.js version, Clerk middleware,
nonce SSR, Node server routes and webhooks in an adapter preview. General Next.js
support is not proof that every pinned version/feature works. No adapter dependency,
Workers purchase or web deployment has been made.
[Cloudflare Next.js guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/).

## Authentication gate

Create and verify the approved Clerk production instance. Set its production keys,
provider credentials, domain/DNS certificates, permitted origins and redirects;
verify Google, Apple, email/password, username and phone with real accounts. Check
email/SMS delivery, abuse controls and spending limits. Review `authorizedParties`
and subdomain allowlists. Development shared OAuth credentials are not production
credentials. [Clerk production guide](https://clerk.com/docs/guides/development/deployment/production).

Register the **exact production issuer** from that instance in Supabase native
third-party authentication. Ensure session claims include `role: authenticated`.
The versioned private trusted-issuer mapping must match; never derive it from a
client-supplied issuer. Preserve UUID ownership using reviewed identity linking;
production users/subjects must not be assumed identical to development subjects.
Keep current handler-level verification and reject wrong-issuer/forged tokens.
No legacy JWT template or Supabase signing-secret sharing is needed.
[Native Clerk integration](https://supabase.com/docs/guides/auth/third-party/clerk).

Decide how existing founder accounts move into production, and explicitly approve
legacy Supabase Auth cutoff after testing continuity. Do not automatically link by
email or delete original accounts as part of deployment.

## Configuration gate

Use the host's environment store, with staging and production values separated.
Names below are configuration inventory, not instructions to copy local secrets.
The repository example is `apps/web/.env.example`; no root `.env.example` currently
exists. Root `.env.test` is private operations material, not a deployment artifact.

| Location                   | Names                                                                                                                                                                                                                                                  | Boundary                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web public build config    | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_MEDIA_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`                                                                                                                       | Selected environment's public identifiers; RLS remains mandatory. Rebuild when changing inlined public values.                                                                        |
| Web server environment     | `CLERK_SECRET_KEY`, `CLERK_ISSUER`, `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `SUPPORT_EMAIL`                                                                                                                                       | Instance-matched Clerk credentials and webhook signature; Supabase service role is privileged. Support address must be real and founder-supplied. Never `NEXT_PUBLIC_`.               |
| Supabase Edge secret store | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_UPLOAD_BUCKET_NAME`, `R2_PUBLIC_URL`, `ALLOWED_ORIGINS`, `CLEANUP_SECRET`, `CLERK_SECRET_KEY`, `CLERK_ISSUER`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_CACHE_PURGE_TOKEN` | Scoped R2 object permissions and zone Cache Purge permission, selected Clerk instance, explicit origins; cleanup secret matches Vault. Supabase runtime provides project credentials. |

Use `supabase/functions/.env.example` as the Edge variable-name reference, and
[managed secrets guidance](https://supabase.com/docs/guides/functions/secrets).
Rotate credentials previously exposed in chat; confirm every consumer and Vault
entry is updated. Never upload an entire local environment file to a browser bundle.

Approve exact staging/production browser origins in both R2 CORS and Edge allowed
origins; do not use wildcard writes. Verify the private incoming bucket remains
private, publication domain serves only intended assets and HTTP Range playback
works. Review security headers with Clerk and legal external player embeds, rather
than shipping a policy that breaks authentication or media.

The web server and Edge cleanup both need the selected Clerk issuer/secret for their
own operations; configuring one does not configure the other. The web webhook route
also needs the selected instance's webhook signing secret. Review endpoint registration,
signature verification, replay/idempotency and deletion retries before trusting it.
Development lifecycle credentials and purge secrets are configured; the real purge
journey is not yet verified. The support address is still missing and must not be
invented, inferred from the domain or treated as a working inbox.

## Staging gate

1. Check out the reviewed release commit and use its pinned pnpm/Node requirements.
   Install from the lockfile; run repository tests, lint, types, build, Deno checks
   and transactional SQL security suites against the intended test database.
2. Review migration history and a dry run before any database update. Never perform
   a blind production schema push. Obtain approval for the concrete shared/production
   database change and deploy procedure separately from local code review.
3. Deploy the web staging preview with approved non-production configuration. Record
   the URL, commit, environment selection and test results. A production-mode local
   server can catch build differences but does not verify hosted infrastructure.
4. Test guest discovery/search/profile/watch; sign-in/onboarding; native and external
   publishing with hook/poster; reload/retry/cancel; large upload failure and quota
   behavior; Loop preferences; two-user chat; credit responses; report/block flows;
   disabled/deleted access; keyboard and mobile-browser usage. Include cross-user,
   guessed-ID, private-draft, forged-token and expired-session denials.
5. Test actual provider callbacks on the hosted URL, CDN seek/range behavior, strict
   CORS and reconnect behavior. Record limitations; do not label mocked operations
   or an untested provider as working.

## Recovery and operations gate

Document database backup availability/retention for the selected project and plan;
do not assume a particular paid recovery feature. Perform a restore drill into an
isolated database, recording timestamp, duration and validation of migrations,
private identity mappings, grants/RLS and application data. Keep a separate secure
record of configuration and secret recovery procedures. [Supabase backups](https://supabase.com/docs/guides/platform/backups).

A PostgreSQL backup does not contain R2 video bytes. Establish an approved separate
media backup/export process, storage location, retention, access controls and cost
budget. Inventory object keys, sizes/checksums and their asset rows. Demonstrate
restoring one film, hook and poster to a test destination and confirm playback and
metadata consistency. A lifecycle cleanup rule or a migration/copy tool alone is
not proof of recoverability. [R2 data migration tools](https://developers.cloudflare.com/r2/data-migration/).

Name the person handling abuse reports/takedowns, account deletion requests and
incidents. Verify cleanup scheduling, failed-upload reservations, indexing retries,
function errors, quota failures and provider usage alerts. Logs must not include
JWTs, passwords, signed upload URLs or private message bodies. Agree backup recovery
objectives and an outage contact path before onboarding the public.

## Founder policy decisions required

These are facts and product-policy decisions to supply and review, not legal advice
or a claim that a generated template establishes compliance:

- Legal operator name (individual or registered entity), jurisdiction/base of operation,
  contact details permitted for publication and the real monitored support mailbox.
- Initial audience and regions, age eligibility, and who reviews jurisdiction-specific
  requirements. Do not invent a governing-law statement or age threshold.
- Creator rights/permissions, supported external embeds, prohibited content,
  reporting/takedown and appeals processes, response ownership and escalation.
- Data inventory and purposes (public profiles/films versus private messages,
  preferences and events), service providers, user choices and public/private defaults.
- Concrete retention periods for account data, messages, watch/preferences events,
  reports/audits, abandoned uploads and backups; deletion timing, recovery windows,
  any justified exceptions, and how a user requests deletion/export.
- Whether any optional analytics/cookies will be introduced. Current engineering
  must not promise "no data collection" or "instant deletion everywhere" without proof.

Publish only founder-reviewed policy text matching actual behavior. Support links
must reach the supplied mailbox. CI setup, monitoring ownership, backup/recovery drills
and a complete hosted staging test remain release work.

## Release and rollback record

Founder approval must identify the commit and destination. Record migration and
function versions, keys/issuer selection, completed gates and any explicit accepted
limitations. Retain the prior web artifact and configuration for rollback; database
changes need their own reviewed recovery plan. Roll back the web without destructively
resetting the database. Smoke-test production after release, then monitor actual
errors and costs. Until those actions are recorded, status is **prepared or tested
in development/staging**, never **verified production-ready**.
