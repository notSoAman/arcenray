# Upload pipeline reliability — 1 November 2026

Owner: Codex. Branch: `codex/robust-upload-publish`. The founder authorized
implementation and production release. Scope: publish UI, shared multipart
transfers, the existing Supabase processing/publication queues. No dependency,
encoder quality, VM size, storage region or public API signature change.

## Causes and changes

- Recovery controls previously appeared for every saved draft, including healthy
  transfers. The file label also asked for re-selection whenever a reservation
  existed. Recovery now appears only for interrupted/reopened uploads.
- Choosing a replacement left the previous asset's processing status on screen.
  Status is now tied to the selected, completed asset. Polls do not overlap and
  responses issued before a local operation cannot overwrite its newer state.
- The background checkbox previously submitted immediately and disabled Publish.
  It now selects what happens after the explicit Publish click. A confirmed queued
  request sends the creator Home with a dismissible notice if checked. Otherwise
  the page waits and opens `/films/:id` after confirmed publication. Ready films
  open directly. Rights and asset-readiness checks remain required.
- Brief create/status/sign/finish failures now retry with the same reservation.
  Canonical server reconciliation still determines which parts need sending.
  Two rolling transfer lanes replace pairwise barriers, so one slow part cannot
  leave the other transfer lane idle. Concurrency and memory limits remain bounded.
- Publication previously ran only before an encode claim. A ready film could wait
  behind another long encode. Existing authenticated worker claim/heartbeat/finish
  requests now wake a bounded background publication drain with `waitUntil`.
  Durable database leases and retry remain authoritative after runtime shutdown.
  No browser session or Oracle software update is needed for this path.
- Dispatch now serializes one encode lease for the existing single processor,
  preventing overlapping polls from oversubscribing it. Expired attempt objects
  are queued for cleanup; five repeated worker crashes become a terminal retryable
  failure instead of unbounded re-encoding. Retry backoff lets other creators run.

## Verification

- Regression tests reproduced transient API alarms and the transfer-lane barrier
  before the fixes. Updated transfer tests pass, including interrupted/reloaded
  uploads, canonical reconciliation, fingerprints and cancellation.
- Queue contention assertions failed against the prior dispatch function. The
  candidate migration passed inside a rolled-back production transaction with
  four disposable creators: one encode, FIFO dispatch, backoff fairness, expired
  lease recovery, stale token denial and bounded crash retries. No fixtures persist.
- Repository tests and types pass. Edge tests cover detached publication draining,
  bounded backlog batches, worker authentication and receipt replay.
- Browser checks use the actual publish components with fixture service responses;
  these are UI verification, not authenticated production upload evidence.

## Release notes

Oracle's existing heartbeat is healthy, but SSH to the recorded address times out.
The user requested inspection in their logged-in Oracle console; this chat has no
browser-control tool for that session. The queue fix uses existing worker calls and
therefore needs no Oracle configuration or service restart. Encoder settings stay
CRF 20/veryfast with complete output validation and compatible-source preservation.

Production also includes newer credits, playback configuration, SEO and sign-up
fixes on `codex/seo-brand-repair`; reconcile those before web deployment.


## Production result

Applied migration: `20261101143010_serialize_media_processing_claims` (local name
matches the recorded deployment identity). `media-processing` v4 is active. The
unchanged Oracle worker consumed three concurrent disposable multipart uploads,
encoded them serially, and published all three after their Clerk sessions were
revoked. Transfers took 21.84, 22.03 and 23.75 seconds. Publication and successful
HTTP 206/CORS playback were confirmed at 51.50, 66.42 and 83.32 seconds from test
setup, including account creation. Each source was a four-second 4K/50fps generated
MP4 padded with a valid 70 MiB free box to exercise multipart transfer. These
short-fixture timings do not predict processing time for full-length films.

The first test setup hit slow DNS resolution on this workstation. Retrying with a
five-minute cache of the independently verified public DNS answer succeeded;
TLS and all authorization remained enabled. No system DNS configuration changed.
This is not evidence that the same resolver issue affects other users.

Web Worker `f2320c3e-a6cf-42c3-b390-d17ec57b1989` is deployed with existing variables
preserved. Rollback web version: `52e63695-485c-4af9-9db6-8cf52855c5de`. Production
and staging share this Worker. Repository tests/types/lint, 62 Edge tests,
Next standalone/Webpack, OpenNext build and Wrangler dry run passed. The normal
Next build alone lacks the standalone directory required by OpenNext; the release
was rebuilt with OpenNext's `NEXT_PRIVATE_STANDALONE=true` setting. No generated
server files or missing manifests were fabricated. Security advisor: no findings.


Final verification: live Home, Loop, sign-up, robots and sitemap returned 200;
Publish redirected signed-out visitors to sign-in. The updated publish bundle and
production security smoke passed. All three disposable films, source/output/public
objects, profiles and Clerk users were removed; exact orphan embeddings were
removed. The processing and publication queues are empty and the worker heartbeat
is fresh. GitHub's connector denied PR creation with HTTP 403; the verified source
was pushed using the existing SSH repository access.
