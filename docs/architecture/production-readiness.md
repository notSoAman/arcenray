# Production readiness — 2026-10-18

Owner: founder + Codex. Branch: `codex/production-readiness`.

Scope: remaining web MVP implementation and release verification, preserving existing
UI tokens/contracts and native Supabase/Clerk/R2 boundaries. No mobile build,
marketplace, resource purchase or web deployment is included in the completed work.
**Status: development implementation and verification in progress; not production-ready.**

## Implemented and applied in development

- Credit editing is integrated into saved drafts; registered creatives can respond
  to invitations in their own profile's Credits tab. Verification is RPC-controlled,
  not a client-writable field. Duplicate submits, failures and retries have UI states.
- New onboarding includes 12 abstract cinematic reference cards and exactly three
  private choices. Details save before preferences and completion. Existing profile
  editing remains compatible. No embedding inference or invented vectors are required.
- Direct-write limits and per-conversation latest-message summaries replace the
  inbox's global 300-message window. Owner/participant access remains RLS-backed.
- Account deletion, profile disablement, report review/takedown, private moderation
  audit and queued media removal/restoration are implemented. Cleanup retries include
  Clerk account deletion, R2 object processing and exact-URL CDN invalidation.
- Strict Clerk nonce CSP, dynamic rendering and other security headers are in code.
  Clerk's nonce/strict-dynamic enforcement makes its inline-script fallback ineffective
  in supporting browsers; required inline styles remain allowed.

These five migrations are applied to the linked **development** database; generated
TypeScript definitions have been refreshed:

```text
20261017162137_direct_write_limits_chat_summaries.sql
20261017162403_onboarding_preferences.sql
20261017163012_account_moderation_media_lifecycle.sql
20261018084635_lifecycle_race_and_recovery_guards.sql
20261018090401_private_privileged_rpc_wrappers.sql
```

Development `media-upload` and `media-cleanup` functions are deployed. Founder-only
moderator access is assigned to the resolved stable profile UUID for `test_aman`;
the mutable handle itself is not an authorization check. Report review is available
at `/admin/reports` only after the server's moderator check; each action independently
checks authority again in SQL. The page does not load raw private messages.

Development Clerk issuer/secret and Cloudflare zone-scoped cache-purge credentials
have been configured for their required consumers. Having a populated secret is not
proof that the complete deletion/purge workflow works.

## Verified development checkpoint

All nine SQL suites, 31 repository tests, 28 Edge tests, lint, types and production
builds passed. Production-mode headers and SSR nonces passed HTTP checks. The live
disposable journey verified native/external publication, guest visibility, CDN range
playback, founder takedown with real exact-URL cache purging, private-backup restoration,
credit invitation response, 60-message pagination and persisted reply, shared-asset
retention, real account deletion and old-token revocation. QA cleanup was confirmed
in both PostgreSQL and R2; the founder was preserved.

See [production-readiness-verification.md](production-readiness-verification.md) for
commands, test-only expiry acceleration, screenshot and limits. The founder approved
secret-free GitHub checks; `.github/workflows/checks.yml` activates when pushed. This
is a tested development checkpoint, not a production release.

## Remaining release gates

| Gate                    | Outstanding evidence or founder decision                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final regression        | GitHub CI must pass on the final reviewed commit; rerun affected checks after further code changes.                                                                   |
| Lifecycle               | Hosted signed Clerk webhook delivery/retries remain unverified; development deletion/purge/restoration passed with disposable fixtures. Preserve bounded worker and lease tests. |
| Large media             | Resumable large-file upload engineering and realistic interruption tests; durable automatic reindexing after credit edits; client conversion is not implemented. Keep limitations explicit.                                                                           |
| Hosted staging          | Choose host and environment, obtain approval, deploy staging, then run complete guest/auth/onboard/publish/search/watch/chat/credits/moderation journeys on desktop and mobile browsers. No web staging deployment exists yet.     |
| Production identity     | Production Clerk instance, provider credentials, issuer trust/private mapping, approved domains, real OAuth/email/SMS delivery, existing-user continuity and legacy Auth cutoff decision.                                          |
| Support and policies    | Founder supplies the real support address and approves operator/jurisdiction, rights/reporting/appeal, privacy, retention and deletion decisions. No invented company/legal promises.                                              |
| Recovery and operations | Database restore drill, separate R2 recovery drill, monitored cleanup/indexing errors, abuse handling, budgets/alerts, CI release checks and reviewed rollback.                                                                    |

See [deployment-readiness.md](deployment-readiness.md) for the concrete configuration,
hosting tradeoffs and founder decisions. No paid plan has been purchased, host selected,
production database updated or website deployed by this work.

Release gate: all relevant checks and the real staging journey pass, production
credentials/domains and policies are supplied and approved, recovery and abuse
operations are reviewed, and the founder approves the exact destination and commit.
