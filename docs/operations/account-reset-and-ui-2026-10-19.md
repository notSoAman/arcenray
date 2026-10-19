# Account reset and UI update — 19 October 2026

Founder explicitly approved deleting all accounts and their content across both
Clerk instances and the shared pilot, including the founder. A private ignored
recovery snapshot was taken first: 8 profiles,3 films,8 Clerk accounts and10 R2
objects. Object sizes and SHA256 hashes were verified before deletion. Clerk login
credentials/identities cannot be restored simply by replaying that snapshot.

All8 Clerk accounts were deleted. Existing account-deletion RPCs and bounded media
cleanup processed the mapped profiles, revoked identities, removed legacy auth rows,
deleted media and purged CDN copies. Final verification: both Clerk instances empty;
Supabase profiles, films, auth.users, media assets and deletion jobs empty; both
arcenray-media and arcenray-uploads listings empty. Minimal revoked identity tombstones
remain to prevent old-token recreation. New founder moderator access must be granted
explicitly to a verified newly created account; it is not assigned to the first signup.
No schema, provider configuration, billing or DNS changes were made.

The private snapshot is under `.private-backups/account-reset-2026-10-19/`, ignored
by Git with directory permissions700 and individual snapshot files600. It includes
user data and is operator-only; never attach it to a PR or share it with collaborators.
Recovery requires reviewed restoration of database rows and R2 bytes and creation or
verified remapping of new Clerk identities. Do not bypass revocation checks.

Clerk's signup username now seeds the initial public handle and full name where
provided. Onboarding displays the seeded handle without requesting a second entry.
Unsupported or conflicting handles remain correctable. Later edited public handles
are retained rather than overwritten by Clerk on subsequent visits. Public handle
edits use the existing profile API; they do not change Clerk's sign-in username.

Settings starts with a read-only populated profile. Edit enables fields, roles,
handle and prepared profile-picture upload; Save/Cancel restore read-only state.
Signout is in Settings, account deletion is collapsed at the bottom, and profile-page
Edit/signout actions are removed. Header Settings is a labeled hamburger icon.

Search, navigation, profile and film layouts now shrink/wrap; film Play uses a
readable brand gradient and Details uses white. Verification: lint/types,33 web tests,
production OpenNext build; real-browser search at320/375/390/768/1024/1440 widths with
no horizontal overflow. Actual settings/nav components were tested in an isolated
fake-data/API preview at those same widths: read-only -> Edit -> Cancel and Save
passed. This does not claim a new real production account or photo was created after
the reset; existing profile/photo service contracts are reused unchanged.
