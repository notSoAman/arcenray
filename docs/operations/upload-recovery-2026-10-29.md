# Upload recovery and background publication — 29 October 2026

Owner: Codex. Scope: web publishing, shared multipart transfer, Supabase processing
and publication contracts, and the existing Oracle worker. The founder authorized
investigation, fixes and production deployment. No dependency, instance-size or
storage-region change was required.

## Observed causes

- Capacity reporting ran only between jobs. During Varnika's encode, its heartbeat
  was 27 minutes old despite about 78 GB of available advertised scratch capacity.
  Admission requires a report newer than two minutes, so new uploads were refused
  while the worker was busy. The worker now refreshes capacity during processing.
- Oracle has two CPU cores and 12 GB RAM. FFmpeg used about 194% CPU while over
  10 GB RAM and 89 GiB disk remained available. Varnika was a 4,662,659,877-byte,
  3840×2160, 50 fps H.264/AAC source lasting 1,041.3 seconds. This was CPU-bound
  conversion, not a memory shortage.
- Varnika's reservation-to-queue interval was about 378 seconds; worker source
  download took approximately 97 seconds. Processing finished about 86 minutes
  after upload. The final file was 522,805,281 bytes. These are observations of
  that upload, not promised times for other films.
- Unsupported inputs lost their specific failure reason and could be downloaded
  repeatedly across five attempts. Short API outages could also terminate a valid
  long encode; killing only its Python parent could leave FFmpeg running.
- Browser part failures required manual recovery, and an inactive transfer could
  wait 30 minutes. Worker input and output transfers were serial.
- The 120/hour media-operation allowance also counted part signatures. A 25 GiB
  source needs about 200 two-part signatures; large otherwise-admissible uploads
  could exhaust that allowance before completion.

Supabase's sampled last-24-hour successful upload calls had median 502.5 ms and
p95 3,046 ms; processing calls had median 293 ms and p95 834 ms. Transient 502/503
responses existed and now have stronger recovery. No 401 was observed in that
sample. The Supabase project is in Mumbai and both R2 buckets are APAC. These
observations do not implicate Clerk or a storage-region mismatch as the cause of
the long encode; they are not a blanket guarantee of provider latency.

## Delivered behavior

- Two concurrent client parts, automatic bounded retry with fresh signatures,
  and a 90-second inactivity watchdog; existing resume reservations are retained.
- Four bounded, ETag-pinned source range reads and two parallel output parts.
- CRF 20/veryfast encoding with the existing resolution, source-preservation,
  codec, duration and full-decode validation requirements.
- Capacity heartbeats while busy, conservative lease recovery, process-group
  cancellation, idempotent completion receipts and safe terminal error codes.
- Plain-language processing stages remain visible after reopening a draft.
- Explicit server-side publication requests survive a closed page and revoked
  login session. Cancellation, changed film details, ownership, readiness and
  moderation checks are enforced again before publication. Existing index jobs
  handle search indexing. No film is published merely because it was uploaded.
- Transfer signing/status operations have a separate 1,024/hour limit; the
  120/hour creation/publication allowance remains unchanged.

## Encoder comparison

On the actual Oracle VM, a generated four-second 4K/50 fps fixture was processed
and decoded using both policies:

| Policy            | Processing wall time | CPU time | Output bytes |     SSIM |
| ----------------- | -------------------: | -------: | -----------: | -------: |
| medium / CRF 22   |               9.73 s |  17.56 s |    1,305,077 | 0.995060 |
| veryfast / CRF 20 |               6.81 s |  12.58 s |    1,621,516 | 0.995281 |

That benchmark was about 30% faster with roughly 24% larger output and comparable
SSIM. A short real-source comparison also favored veryfast, but the final settings
were not benchmarked against an entire user film. No full-film speedup is promised.

## Verification and release

- Oracle: all 27 Python tests passed, including the Boto3 contract test. Local:
  27 tests ran with the Boto3-only check skipped because it is not installed there.
- Deno: all 61 tests passed, including real handler authentication, completion
  replay, optional-asset publication and queued-publication retry tests.
- Repository `pnpm test` and `pnpm check-types` passed, including mobile callers
  of shared upload code. Client multipart, inactivity, friendly status and storage
  checks passed. Next/OpenNext production build and Wrangler
  dry run passed. The existing ESLint default omits TypeScript files; forcing them
  exposes existing Babel TSX/type parsing limitations, so this is not claimed as
  a clean TypeScript lint result.
- Processing and publication SQL migrations passed rollback tests on an isolated
  PGlite fixture, then the same assertion suites passed against the live Supabase
  database with all fixtures rolled back. This is not a complete fresh-stack
  migration replay. Supabase's live security advisor reported no findings.
- Successful live API test: a 152,771,286-byte generated four-second 4K/50 fps MP4
  (including a valid free box to exercise three multipart pieces and range reads)
  uploaded in 15.40 seconds. Its publication request was saved and its disposable
  Clerk development session immediately revoked. It published automatically
  41.44 seconds after transfer started, and JavaScript CDN Range/CORS checks passed.
  No client publication callback ran. This is a backend integration test, not an
  authenticated browser or native-device journey.
- A prior run independently proved publication after session revocation, but its
  Python CDN transport received 403. The successful run used the application's
  JavaScript transport. Worker timings on the prior identical fixture were
  download 3.024 s, encode 6.066 s, check 0.867 s and output upload 1.373 s.
- Generated fixtures, exact R2 keys and disposable Clerk/profile accounts were
  removed. An interrupted initial fixture was aborted by the existing scheduled
  cleanup before its account was removed. A request to invoke general cleanup
  manually was rejected by approval review and was not retried; subsequent work
  stayed scoped to exact test IDs and keys.

Applied migrations: `20261028222520_media_processing_recovery` and
`20261029062137_durable_film_publication`. Edge Functions: `media-processing` v3,
`media-upload` v20. The tested Oracle files were installed with backups under
`/opt/arcenray/media-processor/backups/20261029-upload-recovery/` and the existing
service restarted only after the active film completed.

Web Worker version: `84bd0815-11ea-4ef7-b4e5-823a385390f0`. Runtime variables were
preserved. Apex and staging use the same Worker, so this was not an isolated
staging deployment. The signed-out home and Loop returned 200; Publish redirected
to sign-in. Live database inspection shows both @nakul films, Varnika and Falling
Pieces, published with completed processing and no processing error.

Rollback: the previous web version is `59c961c1-076e-4fc9-9123-ddb1a4088c33`.
The additive database changes support the previous worker's heartbeat contract.
Do not roll back only the publishing worker while relying on pending automatic
publication requests; drain or explicitly resolve those requests first.
