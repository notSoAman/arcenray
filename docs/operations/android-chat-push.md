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
