# Android chat push

The Android app has an opt-in **Settings → Chat notifications → Message alerts**
switch, plus a contextual one-time prompt after onboarding and after the first
unread message. Android controls lock-screen visibility and notification
permission. Alerts show the sender display name and a short preview; the
lock-screen stays PRIVATE, so content is hidden until unlock. A tap opens the
intended thread only for the signed-in recipient. Thread access continues to
use the chat membership rules. Foreground messaging uses the in-app banner
(sender, avatar and preview) and the unread badge.

Expanded alerts expose **Reply** and **Mark as read** without opening the app.
The `arcenray_chat_message` category is registered at runtime, and
`expo-task-manager` executes custom actions while the app is foregrounded,
backgrounded or terminated. Reply uses the source message ID as its stable
client ID so a foreground/background handoff cannot create duplicates. Mark as
read persists the newest visible message timestamp and never moves an existing
receipt backwards. Successful actions dismiss the matching notification.

The `expo-notifications` config uses a white transparent small icon and a
high-contrast large icon derived from the accepted `a` mark on Void. These are
native drawables, so this improvement requires a new app build rather than an
OTA-only update.

Production builds mount `google-services.json` from an EAS file secret outside
the uploaded workspace. Push support therefore follows the release identity,
and `apps/mobile/fingerprint.config.js` excludes the mounted
`eas-environment-secrets` path from the fingerprint. This keeps the pre-build
and worker runtime versions equal without disabling Expo's native compatibility
guard.

The original migration added private device and delivery tables, a message
insert trigger, three service-only RPCs, and a ten-second Cron dispatch. The
`20261121191000_chat_delivery_overview` migration made dispatch near-instant:
jobs are due the moment a message commits, an AFTER INSERT
`messages_notify_chat_push` trigger posts the worker through pg_net (it runs
after `messages_enqueue_chat_push` by alphabetical trigger order), and the Cron
was relaxed to 30 seconds as the retry and Expo-receipt sweeper. The claim
query was split into `private.prune_chat_push_jobs()` plus the claim itself,
and now returns `sender_name`, `preview` and `message_id` (voice notes and
attachments get "Sent a voice note" / "Sent an attachment" copy; whitespace
collapses to one line, 140 characters max). `public.get_chat_overview()` gives
clients one consistent snapshot of receipts, newest message and the peer
receipt, so unread badges and delivery ticks cannot race. It uses the existing
Supabase operations JWT and cleanup secret in Vault. The worker checks read
state, account availability, blocks, and the active device registration before
sending. It retries transient failures, checks Expo receipts, and retires
invalid tokens. A crash after Expo accepts a send but before saving its ticket
can cause a duplicate. Sign-out and disable revoke registration. If the device
is offline, revocation is best effort until the app reconnects under that
account or the registration expires.

Deployment note (2026-11-21): the Supabase MCP transport corrupts dense
multi-kilobyte single statements, so the claim pair is split and the migration
was applied in small batches through `execute_sql`; the ledger row
`20261121191000` was recorded to match the committed file. The service role
needs `grant execute` on the private claim pair for the security-invoker
wrapper; that grant is part of the migration file. `chat-push-dispatch`
deploys as a self-contained bundle (v3) with no relative imports.

## Staging and release

1. Use the Android Firebase client configuration for the package in the build.
   Set `ARCENRAY_ANDROID_GOOGLE_SERVICES_FILE` to its path in the selected EAS
   environment. The development package is `com.arcenray.mobile.dev`, and the
   preview and store packages are `com.arcenray.mobile`. The Firebase admin key
   belongs in EAS FCM v1 credentials. It must never enter the repository or the
   app bundle.
2. Enable Expo enhanced push security and supply its access token as the
   Supabase Edge Function secret `EXPO_PUSH_ACCESS_TOKEN`. Validate the
   configured Vault operations credentials in staging. Deploy
   `chat-push-device` and `chat-push-dispatch` and apply the versioned migration
   through the existing review and release process.
3. Build a new native Android app and verify a store version code greater
   than 8 before any Play submission. The Expo Notifications native module
   changes the fingerprint, so installed v8 cannot receive this feature
   through an over-the-air update.
4. With two staging accounts and an Android device, opt in, background the
   recipient app, lock the device, and send from the other account. Confirm
   sender name and preview text, tap-to-thread after a cold start, and no
   duplicate foreground banner. Repeat with Android permission denied, chat
   alerts disabled, a read message, a block, and sign-out.

Sub-minute dispatch no longer depends on the Cron: the insert trigger
delivers within tens of milliseconds (verified 22 ms to the worker POST).

Run the rollback-only database assertions against an isolated Supabase
instance with `pnpm exec supabase db query --local --file supabase/tests/chat-push.sql`.
Confirm **Private Android chat push registration, delivery and authorization
assertions passed**. The local check does not exercise Expo or FCM delivery.

## Production rollout — 2026-11-21

- Production project `ropbxsnjtejfomnpdllf`: migration
  `20261121170337_android_chat_push` applied earlier, then
  `20261121191000_chat_delivery_overview` applied in batched form (MCP
  transport limits; the ledger row matches the committed file). The
  registration, delivery, read, block, revocation and authorization behaviors
  carry over; new assertions cover immediacy, enriched claims and the
  overview grants. Cron `arcenray-chat-push` is active at a 30-second sweeper
  cadence.
- `chat-push-device` unchanged; `chat-push-dispatch` redeployed as version 3
  (self-contained bundle) with sender name and preview alerts. The production
  `EXPO_PUSH_ACCESS_TOKEN` secret and Expo enhanced push security were already
  set. A dispatch smoke with the Vault operations credentials returned HTTP 200
  `{claimed:0,rejected:0}` before the live test.
- Live delivery proof (2026-11-21 19:25 UTC): a real message inserted into the
  founder↔reviewer conversation produced a due job instantly, the notify
  trigger posted the worker 22 ms later, the 30-second sweeper claimed it after
  the permissions fix above, Expo accepted the send, and a forced receipt check
  confirmed **delivered** to the registered device.
- Production build `067f0421-af84-4918-b1b4-e0fe56bee9f0` completed as
  `0.1.0 (10)` from commit `e4e6c7c`. The AAB SHA-256 is
  `fd69f1a5e93de7ea98816a33464f65f04a32a467f45feec2951f0b07d40f36b1`
  and it is signed with upload key SHA-1
  `9A:B2:F4:38:7A:5A:00:97:48:6C:E3:3E:63:05:E4:47:6E:57:4D:1D`.
  The manifest contains `POST_NOTIFICATIONS`, the Expo Firebase messaging
  service and the `chat-messages` default channel.
- Play submission `9c054528-d03c-4055-975c-0c227ea14a3b` uploaded the build to
  **Arcenray Closed Testing** with release status completed. Play Console showed
  the release **in review** at the time of writing; tester availability and the
  real lock-screen delivery test remain pending with the founder.

## JS-only rework delivery — 2026-11-21 (feat/chat-excellence)

The chat experience rework (typing indicators, delivery ticks, grouped
bubbles, memoized rows, consistent unread state, contextual push prompt, web
typing/Seen parity) is JavaScript-only and rides the v10 native base. Ship it
to the production channel with, from `apps/mobile`:

    EXPO_TOKEN=<token> npx eas-cli update --branch production --auto

The runtime fingerprint is unchanged from the v10 build, so the update applies
to installed v10 clients on first launch. Verify with
`npx eas-cli update:list`.

## Web rollout of the chat rework — 2026-11-21

- Production build from `feat/chat-excellence` (37020d4) with the production
  public environment supplied as process env (Supabase URL/publishable key,
  Clerk `pk_live`, `https://cdn.arcenray.com`, issuer `https://clerk.arcenray.com`).
  Next.js 16.4.1 now hard-stops production builds on a published security
  advisory (agent upgrade nudge); the official retry path lets the same
  command continue once. **A Next.js security upgrade remains recommended
  before the next build.**
- Worker version `7274b38f-b2ad-45c6-982e-911eb7c2bd56` (arcenray-web):
  preview-tested on apex and staging (home 200, /chats guest 307, sign-in 200),
  then deployed at 100%. Live smoke after cutover: `/`, `/loop`, `/sign-in`
  200, `/chats` 307 for guests, staging 200. The served chunks contain the new
  chat code (`chat-presence`, `recording audio…`).
- Rollback: `wrangler rollback` or redeploy the previous version
  (`dbea0620-d23a-4e40-89e1-7a99c34d3` era) via `wrangler versions deploy`.
