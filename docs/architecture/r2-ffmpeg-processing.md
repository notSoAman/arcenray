# R2 + FFmpeg media processing

Owner: Codex. Founder authorized implementation and production rollout on
2026-10-25. Main-film processing is implemented on the existing Supabase, R2 and
Oracle Always Free setup. MP4 remains the only accepted main-film container.
Posters, profile pictures, discovery hooks and external embeds keep their current
pipelines.

## Current behavior

1. The browser uploads the source directly to the private `arcenray-uploads` R2
   bucket using resumable multipart uploads. The app/API never buffers the full
   video. New sessions use 64 MiB parts; sessions already in progress retain
   their original part size and resume metadata.
2. Supabase verifies the completed object, reserves capacity and queues a durable
   processing job. Public playback and publication remain unavailable while the
   source is unprocessed.
3. A single outbound-only systemd worker on Oracle polls the secret-authenticated
   Supabase Edge Function, downloads the exact ETag-bound private source, processes
   it on scratch disk, and uploads a unique private output attempt to R2.
4. Supabase independently checks output length, ETag and MP4 metadata/samples,
   compares the active lease and lifecycle, then replaces the draft asset and
   queues source/attempt cleanup. Publishing stays blocked until this succeeds.
5. The publish page displays queued/processing/failed/ready states, supports retry,
   and reloads status. It does not claim a percentage while FFmpeg is working.

The worker has no inbound listener. Its systemd service runs as a dedicated
non-root user with a read-only root filesystem, private temporary space, 10 GiB
memory and two-CPU limits. It uses a permanent R2 key scoped to object read/write
on `arcenray-uploads` only. Supabase holds a separate shared processor secret.
Both secrets stay outside the repository and are stored with owner-only local and
server permissions. A temporary R2 probe object was uploaded, read and deleted to
verify that credential; no user media was used for that check.

## Processing policy `1080p-v1`

- Inspect the actual file; browser codec/dimension claims are not authoritative.
- Preserve already suitable H.264 8-bit 4:2:0 Baseline/Main/High, AAC mono/stereo
  (or no audio), <=60 fps, <=1920x1080 and <=4.5 Mbps whole-file bitrate. Keep
  every byte when the MP4 is already seekable; otherwise losslessly remux it.
- Convert other supported SDR MP4 files to H.264/AAC, CRF 20/veryfast, within
  1920x1080, original aspect ratio, no upscaling and at most 60 fps. If conversion
  would enlarge a compatible source, keep its encoded streams and remux instead.
- Validate MP4 structure, codecs, dimensions, audio, duration and decode every
  output packet before it can be accepted.
- HDR/BT.2020, anamorphic pixels, multiple video/audio tracks, edges over 8192px
  and frame rates over 240 fps fail with an explicit message; they are not silently
  tone-mapped or stripped.

Processing begins after upload, so compression does not reduce upload bandwidth.
No target output size or fixed processing time is promised. Film grain, motion,
duration and sound affect the encoded size. Appropriate low-resolution/low-bitrate
files are preserved rather than recompressed for a smaller byte count.

## Capacity and user-facing limits

The application no longer has the former 2 GiB per-file cap. R2's 5 TiB multipart
protocol ceiling is not the practical processing limit. Admission uses current
worker scratch capacity and a conservative `3 x source size + 1 GiB` disk reserve;
only one job runs at a time on this VM. The current 96 GB boot disk admits roughly
25 GiB source files when otherwise idle; available capacity changes as disk usage
changes. This is therefore a dynamic capacity limit, not literally unlimited
single-file uploads. Large uploads may take hours and can fail clearly when the
worker lacks space or processing time.

The app/account storage policy is separate from processor scratch capacity. Monitor
Oracle disk, R2 storage, Supabase job failures and retry/cleanup queues. A larger
source ceiling requires larger scratch storage or multiple appropriately isolated
workers, not a higher database constant alone.

## Security and lifecycle

- R2 source/output objects remain private until trusted completion; never write
  processed output directly to the public media bucket.
- Job manifests cannot choose bucket names or arbitrary URLs. Source paths are
  owner-scoped and ETag-bound; each attempt writes to a unique key.
- Leases and compare-and-set transitions handle retry, worker restarts, draft
  deletion, suspension, publication, stale output and cleanup races.
- Service-only tables/RPCs carry the durable queue, capacity heartbeat and cleanup
  state. Public wrappers retain explicit grants and fixed search paths.
- The worker suppresses FFmpeg and SDK error details; logs do not contain source
  files, object URLs, manifests or credentials.
- Supabase security advisor reported no issues immediately after the migration.

## Production verification

- Worker-side FFmpeg suite: 18 tests pass on the Oracle VM, including real
  compression, pass-through, remux, corruption and R2 SDK contract checks.
- Local suite: 18 tests pass (the SDK contract test is skipped locally because
  its locked Boto3 dependencies are installed only on the worker).
- Browser media checks pass for WebP encoding/cropping, poster ratios, cancellation,
  MP4 inspection, upload progress and cancellation.
- R2 scoped access probe passes. Worker systemd service is enabled and active,
  capacity reporting is fresh, and unauthenticated processor requests return 401.
- Migration was rollback-tested before application; public database types were
  regenerated. Supabase security advisor returned an empty finding list.

The web build and final Cloudflare release are verified separately in the release
record under `docs/operations/`.

## Upload recovery and publication — 29 October 2026

The supervisor reports scratch capacity every 45 seconds during processing as well
as while idle. A transient API error does not discard an encode until its last
confirmed lease approaches expiry; cancellation terminates the whole FFmpeg process
group. Completion retries reconcile an identical saved receipt without re-encoding.
Unsupported exports fail once with an allowlisted error; transient storage failures
retain bounded retries. Owner-only status includes downloading, encoding, checking
and uploading phases, presented in the app as plain-language preparation stages.

Sources over 64 MiB use four concurrent, 64 MiB ETag-bound range reads with bounded
memory and strict length/range checks. Output parts use two concurrent PUTs. Clients
keep two simultaneous upload parts, refresh signatures and retry interrupted parts;
a 90-second inactivity timeout prevents waiting 30 minutes on a stalled connection.
Signing/status requests have a separate 1,024/hour allowance; the 120/hour creation
and publication allowance remains unchanged.

An explicit owner request in `private.film_publication_requests` lets creators close
the page after their files arrive. The existing worker poll claims at most one
publication before its next encode. Assets use the same verified promotion path;
publication finishes only with the exact lease, unchanged saved film metadata,
owned ready assets, completed processing and available profile/film. Existing
indexing triggers enqueue discovery indexing. Transient publication failures retry
with backoff, at most six attempts. The owner can cancel. Saved film detail changes,
deleted films and unavailable accounts cannot publish an older request. This queue
needs the existing worker to remain online; no new scheduler or paid service was
introduced. Previously saved browser-only preferences are not silently converted
into server authorization.

The latest measured performance, deployed versions and verification boundaries are
recorded in [the release report](../operations/upload-recovery-2026-10-29.md).
