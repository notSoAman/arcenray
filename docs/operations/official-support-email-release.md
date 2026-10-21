# Official support email release

Founder approved `arcenray.com` (not `acenray.com`), one shared destination for
the five requested addresses, and production publication. No paid email service
or outbound sending was activated.

## Routing

Cloudflare Email Routing reports enabled/ready with its existing MX/SPF/DKIM
configuration. The shared destination was added and the founder completed its
verification. Exact-match rules are enabled for:

- `office@arcenray.com`
- `aman@arcenray.com`
- `vikrant@arcenray.com`
- `nakul@arcenray.com`
- `arnav@arcenray.com`

All currently forward to the founder-confirmed shared inbox. Each destination can
later be replaced with a different verified inbox. Catch-all remains disabled.
The dashboard/API configuration was read back successfully; arrival of a test
email in the destination mailbox has not been independently observed. Send a
test from a different mailbox before relying on the addresses for urgent mail.

## Application

Canonical public contact is `legalContact.email` in `apps/web/lib/legal.ts`.
Policy paragraphs, policy footer and support page consume this same value.
The revision date and auth setup reference were updated. Ignored local environment
files and the live Worker's `SUPPORT_EMAIL` binding were aligned without exposing
other values. Source commit: `56b3b0e`; PR17.

The website and static legal pages are **two separate Workers**. Updating only
the main app does not update apex `/privacy` and `/terms`: the more specific
routes still point to `arcenray-public`. For future policy edits, rebuild
`scripts/build-public-policies.mjs`, inspect the export and deploy that Worker
as well as the main app. Both use the same version-controlled policy copy.

- Main Worker: `41c953fe-55a5-49f4-9929-904c6a76e0dd`.
- Static policy Worker: `422f49e6-abfd-4f5e-b23e-0fff1bcf07db`.
- Previous main version: `105cef09-edae-40ba-a7f3-a3e1711b305a`.
- Previous policy version: `dd56f53a-a159-40ef-8c9e-6f28d566ada5`.

Staging and apex share the main Worker; they are not isolated deployments.

## Verification

41 web tests, TypeScript, production OpenNext build, public policy export and both
Wrangler dry runs passed. GitHub Checks run `39653245381` passed for the source
commit, including install, tests, lint, types, build and Edge checks/tests. Existing
lint coverage limitations remain; no new lint configuration was introduced.
Production web-security smoke passed. Live HTTP checks on apex and staging verify
`/privacy`, `/terms`, and `/settings/support` contain the official mailto address
and no longer contain the previous Gmail public contact.

No database migration, authentication-provider change, media change, outbound
email, subscription purchase or mailbox-provider migration was performed.
Existing unrelated `apps/web/AGENTS.md` and FFmpeg preparation files were excluded.
