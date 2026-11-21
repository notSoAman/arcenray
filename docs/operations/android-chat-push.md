# Android chat push

The Android app has an opt-in **Settings → Chat notifications → Message alerts**
switch. Android controls lock-screen visibility and notification permission.
Alerts say “New chat message” and contain no sender name, message body or media.
A tap opens the intended thread only for the signed-in recipient. Thread access
continues to use the chat membership rules. Foreground messaging uses the
existing in-app banner and unread badge.

The migration adds private device and delivery tables, a message insert trigger,
three service-only RPCs, and a ten-second Cron dispatch. It uses the existing
Supabase operations JWT and cleanup secret in Vault. The worker checks read state,
account availability, blocks, and the active device registration before sending.
Dispatch timing depends on the scheduler and delivery provider. It retries transient failures, checks Expo receipts, and retires invalid tokens.
A crash after Expo accepts a send but before saving its ticket can cause a duplicate.
Sign-out and disable revoke registration. If the device is offline, revocation
is best effort until the app reconnects under that account or the registration
expires. Any alert already handed to Android contains generic text.

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
   generic alert text, tap-to-thread after a cold start, and no duplicate
   foreground banner. Repeat with Android permission denied, chat alerts
   disabled, a read message, a block, and sign-out.

Sub-minute dispatch requires the PostgreSQL build listed in the
[Supabase Cron quickstart](https://supabase.com/docs/guides/cron/quickstart).

Run the rollback-only database assertions against an isolated Supabase instance
with `pnpm exec supabase db query --local --file supabase/tests/chat-push.sql`.
Confirm **Private Android chat push registration, delivery and authorization
assertions passed**. The local check does not exercise Expo or FCM delivery.

## Production rollout — 2026-11-21

- Production project `ropbxsnjtejfomnpdllf`: migration
  `20261121170337_android_chat_push` applied. The rollback-only registration,
  delivery, read, block, revocation and authorization assertions passed on
  production. Cron `arcenray-chat-push` is active at a ten-second interval.
- `chat-push-device` and `chat-push-dispatch` are deployed. The production
  `EXPO_PUSH_ACCESS_TOKEN` secret is set and Expo enhanced push security is
  enabled. A dispatch smoke request authenticated with the Vault operations
  credentials returned HTTP 200 with `{claimed:0,rejected:0}`.
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
  real lock-screen delivery test remain pending.
