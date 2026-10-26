# Android implementation against the website — 25 October 2026

TASK: link the existing Expo account/project and implement native counterparts to current web user flows.
OWNER: Codex. BRANCH: codex/android-skeleton.
FILES: apps/mobile/**; packages/shared pure discovery/link/upload contracts and tests;
web thin adapters/re-exports for the extracted helpers; mobile/architecture documentation.
DEPENDENCIES: existing Clerk production instance, Supabase RLS/RPCs/Edge Functions,
R2 upload protocol and accepted design assets. No new backend service or database migration.
ACCEPTANCE: native user navigation; existing public/authenticated API behavior; no privileged
client credentials; bounded/resumable direct uploads; Android build and honest runtime evidence.
NO MERGE, DEPLOY, PAID BUILD, DNS, DATABASE, PROVIDER OR PRODUCTION WEBSITE CHANGES.

## Account and identity

Expo CLI connection was explicitly approved at its device-access prompt and verified as
notsoaman (owner of notsoamans-team). Existing project is @notsoamans-team/arcenray,
ID 68a21561-8def-4dff-b6b8-e686e7c3a2c4. EAS init verified the link. No new project,
cloud build, OTA update, store submission, signing credential or paid service was created.
Local Android package/namespace remains com.arcenray.mobile.dev.

The founder explicitly authorized using the supplied pk_live_ publishable key. Both
pk_test_ and pk_live_ are accepted; sk_ and server/service keys are not. Only the existing
public media origin was added to ignored mobile config. No server secret was copied.
Clerk sessions use SecureStore and the Supabase accessToken callback; UUID ownership
still resolves via ensure_current_profile/current_profile_id. New sessions bootstrap a
pending profile. Session/account changes remount native screen state and do not expose
previous account data. The existing Native API was already enabled when inspected.

On 26 October 2026 the founder explicitly approved the prepared production Android
registration and exact hosted redirect. Codex saved and verified registration:
com.arcenray.mobile.dev, debug certificate SHA-256
FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C,
redirect clerk://com.arcenray.mobile.dev.hosted-callback. Clerk automatically created
its standard clerk://com.arcenray.mobile.dev.callback entry with the Android registration.
Android resolves the hosted callback to the installed application's MainActivity.
Store builds require their own reviewed package/signing certificate registration. Provider methods and trusted issuers
are not changed by this implementation.

## Native flow coverage

| Website flow | Native implementation |
| --- | --- |
| Guest home and personalized home | Public/RLS-backed feed, signed-in ranking, genre filter, more results, refresh/error/empty states |
| Loop | Existing Loop feed/feedback RPCs, optional muted-on-intent hook, no fabricated previews |
| Search | Shared hybrid/full-text behavior; people/films and exact city/role/genre filters |
| Film/detail/watch | Public detail and credits, native R2 playback with native controls, compliant provider WebView embeds and explicit provider fallback |
| Film actions | Authenticated likes/bookmarks/deduplicated taste events, reporting and native sharing |
| Profiles | Multi-role/skills/city/bio/work/credits, follow/block/report and open one-to-one conversation |
| Login/signup/onboarding | Clerk hosted flow; stable UUID bootstrap; multi-role form and exactly 3 of the shared 12 vibe references |
| Profile editing | Shared validation and native compact WebP profile picture upload |
| Publish | Own draft list/load/save; native MP4 selection; poster/optional hook; direct resumable multipart; processing status/retry; explicit publish; creator credit invitations |
| Credits | Recipient-only accept/decline through existing RPCs; no client-controlled verified flags |
| Chat | Membership check; existing summaries/messages; live inserts; history; stable idempotent client IDs and mark-read |
| Settings/safety | Storage display, sign-out, reporting/blocking, official support, privacy/terms |
| Account deletion | Explicit website handoff to the existing same-origin/recent-session confirmation route; no unsafe bearer bypass or native deletion shortcut |
| Moderation operations | Existing website remains the operator interface |

Native screens use existing Void/Graphite/Bone tokens and the actual accepted logo export.
They do not import Next.js server components, browser UI, server secrets or cookie auth.
This is a native React Native application; only external provider players and Clerk's
hosted authentication use their appropriate web surfaces. Native visual sign-off is pending.

## Upload adaptation and contract alignment

Moved the web upload state machines into packages/shared/src/media and kept thin Blob/XHR
adapters in web. Existing web tests exercise the same shared state machine. Native uses
FileHandle reads, Expo Crypto and a separate native PUT transport. Expo File.slice reads
the entire file internally, so it is deliberately not used. Hash reads are <=16 MiB;
transport copies only one server-described part to temporary disk using <=1 MiB reads,
checks scratch space, sends that part directly to R2 with Content-Type only, then deletes
that temporary part. No entire-film JS buffer, API proxy, signed-URL persistence or bearer
header forwarding. Android SAF selection does not copy a multi-GiB film into cache.

Checkpoint fields are only request/asset/draft IDs, fingerprint and byte count, scoped to
profile + draft in app-private storage. Resume rehashes the full native source, checks the
same server reservation and canonical parts, renews signatures and retains successful PUTs
when completion must retry. After process death, reselect the same readable file. Some
remote content providers cannot seek; download such files locally before selecting them.
Backgrounding/navigation pauses active work; resume is explicit. No foreground service or
durable Android background-transfer implementation is claimed. Server FFmpeg processing
continues independently after a verified upload. Publication is still server-gated.

Aligned the stale shared multipart client validators with the already-deployed server
protocol: 5 TiB outer byte ceiling, 10,000 part numbers and at most two unique parts per
signing call. This does not grant a 5 TiB processing allowance: current server capacity,
quota, reservations, expiry, MIME and authorization checks remain authoritative. Direct
small-asset validation is unchanged. MP4 only; no additional video provider or codec policy.

## Verification

Final native debug APK: BUILD SUCCESSFUL in 47 seconds, 505 Gradle tasks, x86_64,
Android Studio JBR 25. Installed on Pixel_9_Pro Android 16/API 36 and opened against
local Metro. Native tabs/icons render; live public Home and Loop requests finish with
the actual empty-catalogue states. Search filters render; Chats requires sign-in; the
sign-in route renders sign-in and account-creation entry points. Warm custom-scheme
links to Home/Loop and an invalid film ID work; invalid IDs show an unavailable state,
and Android back returns through the native stack. No fake catalogue was added.

Runtime testing found that Clerk Expo's useAuth returns a new getToken wrapper on each
render. A ref updated after render plus a stable accessToken callback keeps one
Supabase client per account; catalogue requests no longer restart indefinitely. The
client invokes the callback only for asynchronous requests. Account changes still
replace the client and reset screens. A narrow lint annotation documents that deferred
callback boundary, rather than allowing reads of token refs during rendering.

PASS: frozen-lockfile install; Expo dependency compatibility; mobile type check/lint
and 10 tests; all 55 existing repository tests (41 web + 10 media inspection + 4 shared),
root lint/type check and full web/docs/mobile build. Mobile tests additionally check
bounded fingerprint reads and rejection of native content changed while paused.
The root test script does not include mobile tests, which were run separately.

NOT VERIFIED: real Clerk login/callback/session persistence; authenticated production
journeys/RLS; actual R2/provider playback; remote/cloud Android file providers, multi-GiB
transfer/interruption/process-death recovery on device; physical ARM phone or store build.
Local Downloads selection/fingerprinting/playback was subsequently checked below.
No real production film/chat/credit/account mutation is claimed as tested. Authenticated
user journeys require the founder's actual sign-in;
no users/sessions/films are fabricated through privileged APIs to simulate success.
Clerk registration and the hosted redirect were subsequently approved and saved on
26 October 2026. This narrowly scoped authentication change is the only production
configuration change in the mobile work.
Native visual sign-off, verified HTTPS links, release signing and durable Android
background transfer remain separate work. No merge, deployment, schema/resource/provider
or DNS changes were performed. Native screenshots/UI dumps remain ignored in .expo/.

## Approved Android authentication setup — 26 October 2026

Founder approval covered the prepared Android registration and exact hosted callback.
Codex registered only com.arcenray.mobile.dev with the
previously reviewed SHA-256 debug certificate in the existing Clerk production instance,
then added the exact clerk://com.arcenray.mobile.dev.hosted-callback redirect. Clerk also
automatically added clerk://com.arcenray.mobile.dev.callback with the Android registration.
The native API was already enabled; no provider, trusted issuer, account credential,
database schema, DNS or production website deployment was changed.

Verified the saved package/callback rows in the Clerk dashboard. Android's intent resolver
selects com.arcenray.mobile.dev/.MainActivity for the hosted callback. Restarted the
existing Pixel_9_Pro emulator with 2 GiB RAM and two virtual CPUs, reusing the previously
verified APK and local Metro. From the native account screen, the sign-in button opened
a Chrome authentication tab at accounts.arcenray.com and rendered the actual Arcenray
Google/email/username sign-in form. No user credentials or session tokens were copied.
Actual login, callback redemption and authenticated screens remain unverified: the founder
chose to continue without signing in. Cancelling the Chrome auth tab returned to guest
browsing, and retry reopened the hosted accounts.arcenray.com browser tab. Evidence is
stored locally under ignored apps/mobile/.expo/.

### Local native media smoke check

A temporary local-only QA route exercised the existing selectFilm and mainFilmTask native
adapters, plus expo-video, while signed out. A generated three-second H.264/AAC MP4 with
an additional free atom totalled 17,856,833 bytes, crossing the 16 MiB fingerprint boundary.
Android's Downloads document picker returned a content URI without copying the film into
app cache. Native FileHandle/Crypto fingerprinting matched the independently computed
host manifest (9fad8c299c11c1a931c9582daec734e911136fae98206743a94b52896847fe96).
The upload API was replaced only in the temporary test route with a local stub that
stopped after fingerprint creation: no request, reservation, PUT or production write
was sent. The local checkpoint was cleared. Native playback of that content URI reached
3.03 seconds and playToEnd. The test route and disposable downloaded clip were removed;
only ignored local evidence/test-harness text remains in .expo/.

This verifies this local Android file provider, bounded native reads/crypto and local
native video decoding. It does not verify remote/cloud document providers, actual R2 PUT
or Range delivery, server processing, multi-GiB transfer, interruption/process-death
recovery, provider embeds or authenticated publication. No app source/dependency changed
in this approval follow-up; mobile types, lint and all 10 tests passed again. A final
Android export succeeded, and its bundle was checked to exclude the temporary QA route.
The existing emulator is left running in guest mode. The previous full native APK build
and monorepo checks remain the recorded 25 October results; no new native dependency
or binary rebuild was necessary for the approved dashboard configuration.
