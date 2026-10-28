# R2 + FFmpeg preparation

Owner: Codex. Founder approved preparation on 2026-10-21. **Not activated.**
This document supersedes the client-conversion proposal for native main films
only after the activation gates below pass. MP4 remains the selected upload
container. Posters, profile pictures, hooks and external embeds are unchanged.

## Implemented preparation

`tools/media-processor/processor.py` is a runnable, single-job processing primitive.
It can process a local MP4 without credentials, or download an exact ETag-bound
original from `arcenray-uploads`, process it on disk, and multipart-upload the
result to a unique private attempt key in that same bucket. It cannot publish,
delete originals, modify Supabase, or write to `arcenray-media`.

It produces a private receipt containing source identity, attempt ID, output ETag,
SHA-256, actual byte count, policy version and inspected metadata. This receipt is
an input to trusted backend validation, **not** permission to publish. The source
object, its accounting reservation and any output remain subject to the eventual
backend lifecycle. R2 transport tests currently use isolated doubles; no real R2
write or production secret was used for this preparation.

### Smart processing policy `1080p-v1`

- Probe the actual file; never use browser-declared dimensions/codec as authority.
- Retain H.264 8-bit 4:2:0 Baseline/Main/High video, AAC stereo/mono or no audio,
  <=60fps, long edge <=1920 and short edge <=1080 when average **whole-file**
  bitrate is <=4.5Mbps. This is a starting heuristic, not a quality guarantee.
- If suitable and already fast-start/non-fragmented, preserve every byte.
  Otherwise losslessly remux suitable media to seekable MP4. A remux can change
  file size slightly without changing encoded video/audio quality.
- Other supported SDR MP4 inputs: H.264 via libx264, CRF22/medium, AAC160kbps,
  fit inside1920x1080 (1080x1920 portrait), even dimensions, original aspect ratio,
  no upscaling. Preserve frame rate up to60fps; reduce higher frame rates to60.
- If transcoding a compatible source saves no bytes, retain its encoded streams
  through a fast-start remux instead of replacing it with a larger lossy encode.
  An oversized-resolution/incompatible file still needs conversion for playback.
- Validate output dimensions, codecs, audio presence, duration and MP4 structure;
  decode the entire output to detect corruption before uploading it. MP4 metadata
  alone cannot prove successful conversion.
- HDR/BT.2020, anamorphic pixels, multiple video/audio tracks, >8192-pixel input
  edges and >240fps fail explicitly for now. Do not silently select a creative
  alternate audio track or tone-map HDR. Broader support needs fixtures and an
  explicit policy. Inputs need sufficient disk and practical processing time.

No target byte size is promised. CRF prioritizes visual quality; grain, motion,
duration and sound affect the result. Processing happens **after the original
finishes uploading**; this does not reduce original-upload bandwidth or make a
multi-gigabyte film instant.

## Required end-to-end integration before activation

The earlier web/API/database paths enforced 2GiB per film. This branch removes
that fixed cap across the browser, shared contracts, Edge multipart handling and
the pending migration. Multipart boundaries are persisted per session; new
sessions choose a part size between 64 and 512 MiB and stay under R2's 10,000-part
limit. The worker's live scratch-capacity check remains authoritative, so an
upload larger than current safe processing capacity is rejected before reserving
storage. This code and migration are not yet deployed or verified in production.

1. Introduce a versioned private Postgres job table and service-only claim,
   heartbeat, finish and fail RPCs; keep public wrappers unprivileged and privileged
   bodies private, fixed `search_path`, explicit grants and RLS. Reuse Supabase;
   no second queue platform is needed. These migrations are not part of this PR.
2. Main-film multipart completion must verify original byte length/ETag and queue
   processing, not run the current compatible-video verifier against4K/HEVC.
   Raw originals stay private, cannot be attached as ready assets, and retain their
   storage accounting until their actual deletion succeeds.
3. Queue identity: `{job_id, asset_id, owner_id, draft_id, source_key, source_etag,
source_bytes, policy_version, version}`. Claim returns a fresh attempt UUID,
   lease token and expiry. Heartbeat throughout download/probe/encode/validation/
   upload; loss of lease stops work and forbids completion. Host restart reclaims
   expired leases with bounded retries/backoff. Never run two workers on a source
   without distinct attempt keys. The current CLI processes one trusted manifest;
   **the polling/lease supervisor is not implemented yet**.
4. The finish RPC must compare-and-set the current version/lease and recheck active
   owner, draft association, asset lifecycle, suspension/deletion and policy. The
   backend independently HEADs the exact private output ETag/length and inspects
   its MP4 metadata. Atomically record the processed asset and queue original/
   superseded-attempt deletion. Stale receipts cannot revive deleted content.
   Never overwrite an original key or point a film at a worker-supplied arbitrary
   URL. Output checksum metadata alone is not independent media validation.
5. Keep originals until output validation succeeds; delay source deletion until
   all old PUT signatures/writer leases expire, or multipart initiation is safely
   closed. Failed jobs retain a retriable private source for a documented TTL;
   deletion/moderation must cancel processing and clean exact source/output keys.
   Existing cleanup needs explicit support for processing jobs and orphan attempts.
6. The current branch lifts browser/shared-contract/Edge/SQL 2 GiB checks together,
   preserves safe-integer and trusted actual-size checks, stores part size per
   session, chooses boundaries under R2's 10,000-part ceiling and paginates
   ListParts. Existing sessions retain their original part size and fingerprint
   blocks remain independent from upload parts. Validate this with real interrupted
   uploads above 2 GiB before release.
   Update resume deadlines, rate-limit accounting, retries and ambiguous completion
   recovery for longer transfers; current hourly action limits can block large
   uploads. Keep compatibility with existing completed and in-progress sessions.
7. Publish UI: `uploading → queued → processing → validating → ready`, with honest
   indeterminate processing progress until measured, retry/cancel/error states,
   reload recovery and publication blocked until ready. Browser preflight must
   permit MP4 sources it cannot itself decode; server probe is authoritative.
8. Test rollback-only ownership/RLS/lease/replay/deletion races, real >2GiB
   interrupted uploads, disk exhaustion, process kill/restart, corrupted inputs,
   real R2 transfer/checksums and Safari/Android playback. Regenerate shared types;
   test approved migrations, deploy the host, then run a scoped QA pilot before
   the approved web/Edge/database cutover. Obtain founder approval first.

R2 does have a provider ceiling: currently4.995TiB per multipart upload and10,000
parts ([official limits](https://developers.cloudflare.com/r2/platform/limits/)).
“No application size cap” cannot mean infinite storage, memory or disk. Admission
must check available scratch capacity and queue fairly instead of accepting work
the chosen host cannot process. This CLI requires free scratch of3x source size
+1GiB and one job per compute slot; live UI must disclose/retry capacity failures.

## Deployment options to choose next

**Recommended first pilot:** a Linux VM/container host with FFmpeg, at least2–4
vCPU and4GiB memory as a benchmark starting point, one job at a time, and enough
scratch disk for the largest admitted source. These are not measured capacity
guarantees. Start with generated representative4K/long-film fixtures and record
processing time, peak RAM/disk and cost before selecting a paid size.

A managed batch/container job host is the alternative if operating a VM is
undesirable; it still needs disk, timeouts, retries, network policy and secret
storage. No provider or subscription has been selected or purchased. Normal
Cloudflare Workers CPU/memory limits are unsuitable for this FFmpeg process;
Workers Paid alone does not provide the processing host.

Run a patched FFmpeg build as a non-root user in an isolated container, read-only
root filesystem, restricted scratch volume,2CPU/4GiB/pids limits, no host mounts,
no privileges, no inbound listener, and restricted outbound access to R2 plus the
eventual Supabase operations API. Keep software updated; media is untrusted input.
Use a separate R2 credential scoped only to the private bucket; never reuse public
media write permissions or put keys in manifests/images/logs. The CLI hides FFmpeg
stderr and SDK exception details; log job IDs and safe error codes only. On crashes,
reap exact attempt prefixes and incomplete multipart uploads through the backend.

## Local verification

```sh
python3 -m unittest discover -s tools/media-processor -v
mkdir /tmp/arcenray-processed
python3 tools/media-processor/processor.py --local /absolute/source.mp4 \
  --output-dir /tmp/arcenray-processed
```

Python3.12+ and FFmpeg/ffprobe with libx264/AAC are required. The tests generate
their own disposable media; no credentials are required. For R2 mode, create a
virtual environment, install `requirements.lock`, set the three R2 environment
variables in a server-only secret store, and invoke `--job /private/job.json`.
The output directory must already exist and be empty. Receipt files are private.
Do not point this at live content before the lifecycle integration is approved.

Trusted manifest example (dummy identities, no secrets):

```json
{
  "job_id": "00000000-0000-4000-8000-000000000001",
  "attempt_id": "00000000-0000-4000-8000-000000000002",
  "owner_id": "00000000-0000-4000-8000-000000000003",
  "asset_id": "00000000-0000-4000-8000-000000000004",
  "source_key": "00000000-0000-4000-8000-000000000003/00000000-0000-4000-8000-000000000005",
  "source_etag": "\"expected-r2-etag\"",
  "source_bytes": 3221225472
}
```
