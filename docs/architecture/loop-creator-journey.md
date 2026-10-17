# Loop and creator journey — 2026-10-17

TASK: rename discovery to Loop; hook-card scrolling with explicit private more/less
feedback; finish creator publishing and verify the complete browser journey.
OWNER: founder + Codex. BRANCH: codex/loop-creator-journey.

## Existing stable creator contract / file reservation

Creator implementation owns only `apps/web/app/(app)/publish/**`. Use existing
`browserApi`, `createUploadTask`, `inspectVideo`, `prepareImage`, `filmDraftSchema`.
Native MP4 + creator-owned <=30-second hook + poster; external Vimeo/YouTube
alternative uses validated provider IDs, creator-owned hook and poster, no downloading.
Private saved drafts, quota display, honest direct-to-R2 progress, cancellation and
retry, explicit publication, indexing retry and watch/profile links. Do not introduce
new dependencies or modify backend/media helpers. Parent owns navigation, Loop,
shared contracts, schema, tests, documentation and integration review.

## Loop contract

- Canonical `/loop`; old `/discover` links redirect to Loop. Detailed catalog filters remain in Search.
  Existing visual tokens/branding retained. Cards show title, creator, synopsis,
  genre/duration, muted hook playback, sound control and full-film link.
- Intersection-based next-page loading plus accessible load-more/retry/end state.
  Only the visible card plays; respect reduced motion and background tab state.
- More/less feedback is private and separate from public likes. Guests sign in;
  only verified identities can change their own feedback for visible published films.
- Proposed additive migration: private per-user/per-film latest feedback row,
  `set_film_feedback(p_film_id uuid,p_preference text)` and
  `get_loop_feed(p_limit integer,p_exclude_ids uuid[])`.
  Feedback is idempotent (not cumulative clicks). More boosts similar embeddings;
  less lowers similar recommendations and excludes that film. Exact own-history
  reads only; no caller-controlled user ID. RLS, fixed search_path, explicit grants.
- Loop loads ranked unseen IDs rather than offsetting a changing recommendation
  result. Client deduplicates IDs, retries the same exclusion set and stops at the
  real catalog end. Limit each page to <=50, exclusions <=10000; MVP guardrails.
  Existing get_personalized_feed also benefits from explicit feedback.
- New shared-DB changes require review/approval before applying. No cloud resource,
  DNS, auth provider, paid service or production frontend deployment changes.

ACCEPTANCE: public Loop/watch/search, signed-in private feedback, only one active
preview, repeat-free next pages, unsupported media denied, resumable draft editing,
verified publication, indexing/search and two-person chat; deny cross-user writes.
CHECKS: tests/lint/types/build, transactional SQL authorization/scoring/pagination,
live API smoke and real browser upload -> publication -> search/watch/message.

## Implementation and verification

PR #5 (Clerk/public browsing) reviewed and merged as `9aab7fd`. Founder reports
real sign-in working. Loop/creator work builds on that merge, on its own branch.
The additive feedback migration is applied to the linked development project,
with founder approval; generated database types include the three public RPCs.
No Edge Function deployment, provider change, DNS change or paid plan was needed.

Implemented routes: `/loop` and authenticated `/publish`; `/discover` redirects.
Navigation uses the Loop icon and title on desktop/mobile. Existing media helpers
perform metadata preflight, poster preparation and direct R2 upload; trusted server
inspection and publication remain authoritative. Retry preserves valid upload
reservations and skips a completed PUT during verification retries. Draft receipts
are persisted per verified asset. Reload restores saved metadata/assets; interrupted
local files need reselection. Publication has readback recovery and indexing retry.

Checks passed on 2026-10-17:

- `pnpm test`: 23 tests, including media/parser, upload cancellation/retry and safe
  external provider URL validation. `pnpm lint`, `pnpm check-types`, `pnpm build`.
- Five `pnpm backend:test-sql` suites: authorization, Clerk identity, Loop feedback,
  media lifecycle and recommendation assertions; all fixtures rolled back. The CLI
  can exit zero on SQL errors, so the runner additionally requires a success marker.
- Missing/forged tokens rejected by all three user functions (HTTP 401).
- Deno checks for all four Edge Function entrypoints.
- Browser: signed-in creator selects original FFmpeg-generated MP4/hook/PNG,
  uploads through the UI, gets verified receipts, reloads the saved draft (all three
  assets retained), explicitly publishes, confirms indexing, finds the film through
  search, opens native playback (12 seconds, decoded video, no media error).
- Browser: Loop shows metadata/creator, one playing preview, saved explicit feedback,
  additional unique cards and real end-of-catalog state. Desktop and phone-sized
  viewport checked. More changes ranking; less hides the chosen film and lowers
  similar recommendations. SQL tests prove privacy, idempotency and denied paths.
- Browser: creator profile opens a conversation; test message persists, recipient
  reads it via its scoped account and replies, reply appears in the web chat.
- Guest HTTP rendering: home, Loop, search, watch and completed profile return 200;
  publish/chats redirect to sign-in, feedback write returns 401.

Screenshots use disposable synthetic test content and are kept in
[`docs/qa/loop-creator-journey`](../qa/loop-creator-journey/). They document the
populated test state; they are not seed films for the live catalog.

## Limits / remaining launch work

- Native upload uses direct single PUT, not multipart or cross-reload byte resume.
  Large/poor-network multi-gigabyte uploads still need device/network validation.
- Hook selection/export happens in the creator's editor; browser video transcoding
  is deliberately not enabled. Poster conversion is implemented.
- External source IDs/URLs are validated; creator supplies metadata and own hook /
  poster. No external video downloading or automatic metadata scraping; provider
  embed availability is not guaranteed and was not broadly tested here.
- Credit editing/claim verification, content moderation/takedown, account/media
  deletion UX and production hosting/authentication setup remain separate launch work.
- This is responsive web, not an initialized Expo app or production rollout.
- Supabase advisor retains the legacy Auth leaked-password-protection warning;
  Clerk breach checks remain enabled. No new database/RLS warnings reported.

## Fixture cleanup

Founder explicitly approved permanent cleanup of the named QA set. Readback verified
14 QA film rows, six generated media assets (private/public paths), and the disposable
messaging account/profile/conversation removed. Original accounts and content were
retained. Loop returns to its honest empty-catalog state after cleanup.
