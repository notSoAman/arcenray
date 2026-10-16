# Browser media integration — Phase 2

TASK: prepare creator media and upload directly with observable progress and retry.
OWNER: Codex (behavior); Claude Code retains presentation and screen ownership.
BRANCH: codex/browser-media, based on merged backend PR #1.
FILES IN SCOPE: apps/web/lib/media, web test/TypeScript settings, root test scripts,
scripts/check-browser-media.mjs, integration documentation.
DEPENDENCIES: existing authenticated shared SDK and deployed media-upload function.
ACCEPTANCE: sized WebP output; usable video metadata; direct Blob PUT; honest
transfer/verification states; cancellation; retries retain reservation/verified PUT.
TESTS: pnpm test, pnpm test:browser-media, pnpm lint, pnpm check-types, pnpm build.
DO NOT TOUCH: UI routes/tokens, database/RLS/contracts, cloud resources or deployment.
BLOCKERS: no implementation blocker for this slice; Claude still implements screens.
The repository currently has no docs/design directory, apps/mobile workspace, or
.github/workflows directory. The README links the supplied Claude design reference;
this task does not assert visual fidelity or initialize those missing areas.

## Browser helpers

Import these from client components or browser-side controllers. They do not use
credentials beyond the existing authenticated SDK's create/complete calls.

```ts
import { prepareImage, inspectVideo } from "./lib/media/prepare"; // adjust relative path
import { createUploadTask } from "./lib/media/upload";

// api = createArcenrayClient(browserSupabaseClient)
const prepared = await prepareImage(selectedImage, "poster");
const task = createUploadTask("poster", prepared.blob, api.media, (state) => {
  // Render stage and bytesSent / totalBytes. Keep errors and retry controls visible.
});
const receipt = await task.start(); // handle thrown errors in the UI
// Store receipt.asset_id in the existing draft via api.films.updateDraft.
// Film assets are private until the separate explicit api.films.publish action.
```

- `prepareImage(file,'profile_picture',signal?)`: center-crops a square, scales down
  to at most256×256, WebP quality0.80. No upscaling.25KiB is a quality target,
  not a hard limit; the server accepts at most100KiB.
- `prepareImage(file,'poster',signal?)`: preserves aspect ratio, fits800×1200,
  WebP quality0.82, at most512KiB. No forced cropping or stretching.
- Image inputs: JPEG/PNG/WebP, at most20MiB and40 megapixels. Decoder support,
  encoding failures and larger output fail visibly. No automatic quality degradation.
  The browser decoder must read the source before the pixel-count check; the byte
  cap limits exposure but cannot guarantee peak decoder memory on every device.
- `inspectVideo(file,'film'|'hook',signal?)`: reads metadata using a temporary object
  URL; releases it on success/error/abort/timeout. No whole-film ArrayBuffer or API
  proxy. Preflight checks MP4 MIME, byte caps, dimensions, positive finite duration,
  and hook<=30 seconds. Portrait and landscape follow the server's long/short edges:
  film<=1920×1080, hook<=1280×720. A browser metadata result does **not** prove the
  H.264/AAC codec or valid sample tables; server inspection is authoritative.
- Video conversion, hook editing and multipart/resumable transfers are not implemented.
  Offer the creator an H.264/AAC MP4 +faststart export preset if preflight fails;
  do not silently re-encode or imply that unsupported files have been converted.

## Upload task behavior

Keep one `createUploadTask(kind,blob,api.media,onChange?)` instance per selected file.
Run video preflight before creating a video task. Observe `task.state` or the callback:
`idle -> reserving -> uploading -> verifying -> complete`, with `error`/`cancelled`
when interrupted. Bytes sent are transfer progress, not successful publication.

`task.cancel()` aborts the active XHR. Await/catch `start()` to finish cancelling
before calling it again. Double starts are rejected. A reservation request already
in flight may still finish; its asset ID is retained for retry. Verification already
committed server-side may still finish successfully after cancellation. Changing
files requires a new task; cancel the old task on unmount/selection changes.

Call `task.start()` again explicitly to retry. A valid reservation is reused after
network failure. A successful PUT is retained when verification fails so retry does
not resend the video. Expired reservations cause a fresh intent/PUT; the old pending
reservation is released by server cleanup, not immediately. Do not create repeated
new tasks to retry one file: that reserves additional quota. Reload recovery and
resuming partially uploaded bytes are future work.

Signed destinations must be HTTPS R2 hosts. Upload requests send only Content-Type;
the browser computes Content-Length. No Supabase bearer token, cookie credentials,
or API call carries video bytes. Never log signed URLs. Receipt schemas are checked
before returning an asset ID; publication/indexing and draft saves remain explicit
SDK operations, and indexing failures must not hide successfully saved content.

## Checks and limits

`pnpm test` includes7 media-task tests plus the existing14 contract/parser tests.
`pnpm test:browser-media` runs actual local Chrome against synthetic canvas images
and an FFmpeg MP4. It checks output/crop/aspect ratio, cancellation, metadata, direct
PUT and progress, using a temporary browser profile and loopback-only server. It
needs Chrome (`CHROME_BIN` can override the executable) and FFmpeg; no cloud secrets,
account access, live uploads or new packages. Node24 type stripping is experimental.

Browser fixtures exercise local browser behavior; they are not a live authenticated
browser-to-R2 test. The backend smoke separately verifies the live R2 flow. Large-file,
mobile Safari/Android, flaky-network and device memory QA remain before public pilot.
No visual screens changed, so no new visual design or screenshot approval is implied.
