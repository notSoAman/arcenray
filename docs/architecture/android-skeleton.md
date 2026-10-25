> Historical initial skeleton decision. Current implementation and verification: [mobile-parity.md](mobile-parity.md) and [mobile README](../../apps/mobile/README.md).

# Android starting point — 25 October 2026

TASK: start a native Android development app with guest film browsing and sign-in entry.
OWNER: Codex. BRANCH: codex/android-skeleton.
FILES IN SCOPE: apps/mobile/**, pnpm-lock.yaml, pnpm-workspace.yaml,
packages/eslint-config/base.js (resolve its own declared Babel preset), this note.
DEPENDENCIES: existing packages/shared, Clerk and Supabase contracts, accepted brand tokens.
ACCEPTANCE: native navigation; real public feed with loading/error/empty/refresh states;
Clerk entry and secure token storage; Android development build attempted and evidence recorded.
DO NOT TOUCH: web implementation, shared contracts/types, schema, cloud resources,
provider settings, secrets, DNS, CI, production, merge or deployment.

## Recommendation and reuse assessment

Retain the approved Expo Router / React Native direction. Ionic React + Capacitor
could reuse some DOM markup, CSS and browser helpers, but would need a bundled
client application with different routing and session adapters. The existing
Next.js application is not a static bundle: its async pages call server-only
getViewer(), Clerk server auth, cookies/redirects, Next Image and server layouts.
Neither runtime can execute these locally. A remote website in a WebView is a
remote web experience, not a fully native app.

Share packages/shared's generated database types, Zod validation, UUID identity
resolution and Supabase-backed API calls. Keep native UI/navigation independent.
packages/ui contains web components, not native components. The skeleton uses
the existing Void, Graphite, Bone and accent tokens; it makes no new visual-fidelity
claim or logo redraw. Native design review remains pending.

| Concern                | Ionic React + Capacitor                                                                                                                                | Expo / React Native                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Clerk                  | React SDK may help, but web cookie sessions cannot be assumed to transfer; browser callback, secure storage and native session handoff need validation | First-party Expo SDK, SecureStore token cache, hosted browser auth and registered callback intent filter                                     |
| Deep links             | App plugin appUrlOpen plus app router; verified Android App Links require domain association                                                           | Expo Router scheme routes; Clerk config plugin registers hosted callback; verified App Links still require approved domain association       |
| Film playback          | HTML video works inside WebView; native player needs a plugin                                                                                          | expo-video native playback; existing HTML player cannot be reused                                                                            |
| Vimeo / YouTube        | Compliant provider embed in web surface                                                                                                                | Separate compliant embed integration, or explicit provider link; never download/rehost to simulate native playback                           |
| Resumable upload       | Existing Blob/XHR task offers foreground reuse; WebView/file-provider behavior still needs testing                                                     | Reuse API protocol; native URI, bounded reads, hashing and transfer adapters required                                                        |
| Android file selection | HTML file input or native picker plugin; durable content-URI access is not guaranteed by a Blob                                                        | DocumentPicker/SAF integration; manage URI grants, provider availability and app-private copies explicitly                                   |
| Background/retry       | WebView timers and ordinary transfers are not durable workers; Background Runner is time-limited                                                       | Expo background tasks are also constrained; long user-initiated transfers need an appropriate Android native job/service and recovery design |

For uploads, retain owner/draft-scoped idempotent reservations; full-content
fingerprints (16 MiB hash slices, ordered manifest); server-described part size;
canonical server part reconciliation; fresh signatures; pause vs discard;
24-hour resume deadline; verified completion; processing/ready gate before publish.
Do not send Clerk tokens to R2, persist signed URLs, read an entire film into JS,
copy multi-GiB content blindly into cache, or route bytes through app servers.
After process death, reconcile server state and revalidate durable file access.
Connectivity, app relaunch, sign-out/account switching, expired sessions, disk
pressure and OEM battery restrictions require device tests. BackgroundTask alone
does not guarantee an uninterrupted multi-hour upload.

## Current contract findings

- apps/mobile existed as an empty directory; there was no separate mobile ADR or app.
- docs/architecture/clerk-auth.md is the identity authority: Clerk JWT via
  accessToken; stable app UUID through private trusted identity mapping; no JWT template.
- docs/architecture/optional-discovery-hooks.md supersedes mandatory hooks.
- docs/architecture/r2-ffmpeg-processing.md and implementation supersede old browser-media
  notes: new multipart sessions use 64 MiB parts, private server processing follows completion.
- packages/shared/src/contracts.ts still caps multipart create at 2 GiB and signing
  at part 128. Those validators disagree with the newer processing policy describing
  larger sources. Resolve in a separate reviewed contract change before native uploads.
- Browser task depends on Blob.slice, crypto.subtle, XHR and localStorage checkpoints;
  canvas/video metadata, Next navigation, DOM controls and WebView lifetime are not native adapters.
- No upload, profile-bootstrap/onboarding, event recording, playback or account writes
  are implemented by this skeleton. Public browsing always uses an anonymous client.

## Sources checked

- [Clerk Expo quickstart](https://clerk.com/docs/expo/getting-started/quickstart)
- [Supabase Clerk tokens](https://supabase.com/docs/guides/auth/third-party/clerk)
- [Expo monorepos](https://docs.expo.dev/guides/monorepos/)
- [Expo video](https://docs.expo.dev/versions/latest/sdk/video/)
- [Expo DocumentPicker](https://docs.expo.dev/versions/latest/sdk/document-picker/)
- [Capacitor workflow](https://capacitorjs.com/docs/basics/workflow)
- [Capacitor deep links](https://capacitorjs.com/docs/guides/deep-links)
- [Capacitor Background Runner limitations](https://next.capacitorjs.com/docs/next/apis/background-runner)
- [Android transfer options](https://developer.android.com/develop/background-work/background-tasks/data-transfer-options)

See apps/mobile/README.md for setup, verification and remaining work.
