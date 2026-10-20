# Local cities and credit invitations — 2026-10-20

Owner: Codex. Branch: `codex/location-credit-invitations`.

## Implemented

- Local, attributed GeoNames city suggestions in onboarding, profile settings, publishing and search. Keyboard selection, manual input and failure fallback. No runtime geocoding provider, key or new dependency. Refresh with `python3 scripts/update-city-data.py`.
- Owners search public registered creatives by name/handle and invite them for one or more distinct film roles. In-app invitations work on drafts and published films; only the recipient can accept/decline once. Pending invites can be cancelled. Manual and self credits stay unverified.
- Three-bar menu and Settings link to `/invitations`. Accepted credits use the existing published portfolio, collaboration graph and indexing flow. Pending/declined collaborator credits do not link the public film card to their profile.
- Published films permit credit management independently of locked publication metadata.

## Database

Founder approved the scoped shared-pilot migration in chat. `20261020100228_credit_collaboration_invitations.sql` passed rollback-only security tests before application; dry-run showed only this migration. Applied to pilot `ropbxsnjtejfomnpdllf`, regenerated database types, then tested again. Public function wrappers are invokers; privileged bodies stay private. No public draft-film/media access, project editing rights, outbound mail or new roles.

## Validation

- Web TypeScript and shared TypeScript: passed.
- Web tests: 38 passed; shared contract tests: 4 passed.
- Next.js production build: passed, including `/invitations`.
- All 14 database suites passed with fixtures rolled back. Invitation suite additionally tests suspended targets, cancellation and forged verification.
- Supabase security advisor: no issues found.
- Browser city checks on local development: Bombay → Mumbai using keyboard; manual unlisted city; Escape; 320px fit.
- Isolated mocked browser credit checks: search/select/send; accept and decline; draft has no playback link; query change clears identity; menu Escape returns focus. These are UI checks, not a real two-account OAuth session test.
- Default repository lint command exits successfully but its existing config omits TSX. Explicit temporary JSX/TypeScript configuration found no errors on the new components after review; its base no-unused-vars produces false positives on JSX/type imports. TypeScript and build checked all changed TSX. A repository-wide lint configuration repair is separate work.

## Limitations and release

The static city list is about 3.84 MB raw / 1.50 MB gzip, loaded only when suggestions are first needed and cached in the page session. It covers cities, not addresses. Region/country disambiguate suggestions but existing fields persist canonical city names only. Smaller unlisted places can be entered manually. It adds no per-search bill; normal hosting limits still apply.

No web deployment or merge is part of the database approval. Before release: obtain founder approval, build with the production environment using the existing release procedure, deploy and smoke-test public city search and protected invitations. A real owner/recipient account pair should verify the workflow during pilot testing; no accounts or user media were created/deleted for these tests.
