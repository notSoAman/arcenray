# Production sign-in setup

Founder-approved domain: `arcenray.com`. Support: `office@arcenray.com`.
Clerk production instance: `ins_3KsKWRoqHBRWlVrmKzya2JxBj8L`.
Phone login and SMS MFA are disabled for launch by founder decision; no plan was purchased.

## Google

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create an Arcenray project.
2. Configure Google Auth Platform branding and audience. Use the real support mailbox.
3. In Clerk, select **Production**, then the Google connection under SSO connections.
   Copy its exact authorized redirect URI.
4. Create an OAuth client of type **Web application** in Google. Add JavaScript origins
   `https://arcenray.com` and `https://www.arcenray.com`. Paste the exact Clerk redirect URI.
5. Enter the client ID and secret into the blank `GOOGLE_OAUTH_CLIENT_ID` and
   `GOOGLE_OAUTH_CLIENT_SECRET` fields in the ignored root `.env.test`, or save them
   directly in Clerk's production Google connection. Never commit them or paste them into chat.
6. Testing audience settings restrict access; complete Google's publication requirements
   before claiming sign-in is available to the general public. Test a real callback.

[Official Clerk Google instructions](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google).

## Apple

1. Sign in to [Apple Developer](https://developer.apple.com/account/). This requires
   appropriate developer membership/access; enrollment or payment stays with the founder.
2. In Certificates, Identifiers & Profiles, configure an App ID with Sign in with Apple.
3. Create a Services ID for the website and associate it with the primary App ID.
   Use the website domain and exact return URL shown by Clerk's production Apple connection.
4. Create a Sign in with Apple key. Save the downloaded `.p8` file securely outside Git.
5. Fill the ignored `.env.test` fields `APPLE_SERVICES_ID`, `APPLE_TEAM_ID`,
   `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY_PATH` (absolute local path to that file).
   These enable configuring Clerk without placing the private key in chat or source control.
6. Complete any Apple domain/email relay requirements shown by Clerk and test a real callback.

[Official Clerk Apple instructions](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/apple).

## DNS and release

The founder approved five Clerk DNS-only CNAME records. They were installed on
2026-10-18 using the supplied zone-scoped DNS token after the connector's write was
rejected. API read-back and public DNS resolution confirmed all exact targets.
Clerk reports DNS, SSL and email verification complete. Google is configured and the
founder confirmed a real Google callback reached onboarding on staging on 2026-10-18.
Apple is explicitly deferred until developer membership is available. Phone/SMS remain
disabled. No existing DMARC policy was changed.

Supabase trusts the development and production Clerk issuers. The private UUID allowlist,
production deletion webhook and separate issuer-specific cleanup secrets are configured.
The app now serves https://arcenray.com. Production identities are not automatically
matched to existing accounts by email; ownership transfer requires explicit verification.

Google audience publication is controlled in Google Cloud Console; a successful founder
login does not prove that unrestricted public OAuth access has been enabled.
