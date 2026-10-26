# Arcenray Android app

Native Expo Router / React Native application under the repository's established mobile
path. [Architecture and flow coverage](../../docs/architecture/mobile-parity.md).
[Initial Expo vs Ionic/Capacitor comparison](../../docs/architecture/android-skeleton.md).

Home, Loop, search, film playback/actions, public profiles, onboarding/profile editing,
creator publishing/credits, one-to-one chat and settings use the existing shared API,
Clerk identity, Supabase RLS/RPCs and media protocol. Rendering is native. External
Vimeo/YouTube players use provider embeds; Clerk authentication uses its hosted browser
flow. Next.js server components and browser UI are not imported.

## Accounts and public configuration

The explicitly approved Expo CLI connection is logged in as `notsoaman`. This app uses
the existing [@notsoamans-team/arcenray project](https://expo.dev/accounts/notsoamans-team/projects/arcenray),
ID `68a21561-8def-4dff-b6b8-e686e7c3a2c4`. `app.json` declares that owner/project;
`eas.json` contains internal development and preview APK profiles. No new project,
cloud build, OTA update, store submission, paid plan or signing credential was created.

Use Node 24 and the root's pinned pnpm:

```sh
pnpm install --frozen-lockfile
cp apps/mobile/.env.example apps/mobile/.env.local
```

Fill only public configuration for the intended matching environment:

- `EXPO_PUBLIC_SUPABASE_URL`: HTTPS API origin.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: `sb_publishable_` key.
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`: `pk_test_` or the founder-authorized `pk_live_` key.
- `EXPO_PUBLIC_MEDIA_URL`: HTTPS public media origin; absent config omits media.

These values are bundled and readable by users. No privileged credentials belong in
this app. The parser rejects Clerk secret keys and Supabase server/service keys.
Do not copy the web/server environment wholesale. Production public configuration
points at real user data and is subject to the existing authorization rules.

The existing Clerk Native API was already enabled. On 26 October 2026 the founder approved
and Codex saved package `com.arcenray.mobile.dev` with the matching local debug certificate
and callback `clerk://com.arcenray.mobile.dev.hosted-callback`. Clerk also created its
standard `clerk://com.arcenray.mobile.dev.callback` entry when registering the Android app.
The certificate and approval boundary are recorded in the architecture document. Providers
and trusted issuers were not changed. A store build needs a separately reviewed
package/signing registration. The general application scheme is `arcenray-dev://`; no verified HTTPS App Links or DNS changes are included.
The SDK activates the browser session; arbitrary deep-link JWTs are not accepted.

## Local development and Android build

Install the SDK/build tools required by the pinned Expo version and a complete JDK
including `javac`. This machine uses `/home/aman/Android/Sdk` and Android Studio's
`/home/aman/android-studio/jbr` (JDK 25); its system Java 21 is a JRE only.

```sh
pnpm --filter @repo/mobile prebuild:android
pnpm --filter @repo/mobile android
```

To reopen an installed development client:

```sh
pnpm --filter @repo/mobile dev
```

For an APK after prebuild, from `apps/mobile/android`:

```sh
./gradlew :app:assembleDebug
```

The emulator-only check uses `-PreactNativeArchitectures=x86_64 --max-workers=4`.
Physical ARM phones require an ARM build. APK output is
`android/app/build/outputs/apk/debug/app-debug.apk`. This development client loads a local
Metro bundle. An Android Metro export alone is not an APK or device verification.
Generated native folders, debug keys, local SDK paths, builds and `.env.local` are ignored.
Rebuild after any native dependency/plugin change. The linked development-client scheme
is `exp+arcenray`; connect to Metro before exercising ordinary app deep links.

## Reliable uploads and playback

Main films remain MP4 only. Android system file selection uses content URIs without
copying the whole film into cache or requesting broad storage permissions. Some cloud
providers cannot seek; download such files locally first. The native transport reads
bounded chunks, stages at most one signed part in temporary disk and uploads directly
to R2. It forwards no authentication headers and persists no signed URL. Shared web/native
state machines retain reservation identity, confirmed parts and completion retry state.

Keep the app open during transfer. Backgrounding or leaving the publishing screen
pauses/cancels active transfer; return and retry explicitly. After process death, reopen
the draft and reselect the same file. Native resume hashes every byte again before
reusing verified parts. This is resumable foreground transfer, not a durable Android
background upload service. Native compression is not implemented; the existing server
processor and publication gate remain authoritative. No suitable source is recompressed
on the device. Profile pictures/posters are resized to the existing WebP limits.

R2 video uses `expo-video`, native controls and fullscreen. External films remain
provider-controlled embeds with an external fallback. Leaving the screen/backgrounding
pauses native playback or removes the external player. No third-party video is downloaded.

## Checks and evidence — 25 October 2026

```sh
pnpm --filter @repo/mobile check-types
pnpm --filter @repo/mobile lint
pnpm --filter @repo/mobile test
pnpm --filter @repo/mobile exec expo install --check
pnpm --filter @repo/mobile build
pnpm test
pnpm lint
pnpm check-types
pnpm build
```

- Mobile: 10 tests cover API headers/UUID identity/error handling, safe public config and
  media paths, bounded native fingerprinting, changed-file resume rejection, shared
  onboarding choices, provider IDs and multipart protocol limits.
- Frozen-lockfile install, Expo compatibility, mobile lint/types/tests and full root
  lint/types/build all pass.
- Existing 41 web tests pass after extracting the upload engines, including interruption,
  wrong-file resume, unsafe destinations and signature guards. Root tests total 55;
  mobile tests must also be run separately.
- Final native APK compiled successfully: 505 Gradle tasks, x86_64; installed and opened
  on the existing Pixel_9_Pro Android 16/API 36 emulator. Native tabs/icons rendered.
- Live public feed completed and displayed its actual empty catalogue. Emulator testing
  found and fixed an endless reload caused by Clerk's changing token-helper identity.
- On 26 October 2026 the approved Clerk registration/callback were saved. The installed
  app opened the real hosted sign-in form at `accounts.arcenray.com`, and Android
  resolved the callback to the app. Cancelling returned to guest browsing. Actual login
  and callback redemption remain unverified; the founder chose to continue signed out.
- A controlled 17,856,833-byte local MP4 was selected through Android's Downloads content
  URI; native chunk fingerprinting matched the host calculation and native playback
  reached completion at 3.03 seconds. A temporary local-only test route stopped before
  any API call; the route and test clip were removed afterward.
- Additional screen/link checks are recorded in the architecture document. Local evidence
  lives under ignored `.expo/`; no private account screenshots are committed.

Not yet verified: actual Clerk browser login/callback/session persistence, authenticated
production user journeys/RLS, network R2/provider playback, multipart transfers/remote
Android providers, interruption or process-death recovery, and physical ARM phones. No
production test user, film, upload, credit, message or session was fabricated through administrative APIs.
A controlled account/media fixture and actual user sign-in are needed for those checks.

## Remaining boundaries

Native visual/accessibility review and physical-device QA remain. Account deletion
hands off to the website's existing same-origin/recent-session confirmation route;
moderation remains in the website operator interface. Verified HTTPS App Links, durable
background transfer, release signing and store distribution are separate approved work.
This work does not merge, deploy, migrate data, change DNS/providers or create cloud
resources. The web changes are thin adapters/re-exports of shared behavior and have not
been deployed. The pre-existing `apps/web/AGENTS.md` edit is outside this task.
