# Optional discovery hooks

Founder decision, 19 October 2026: discovery hooks are optional for native and
external films. This supersedes the earlier mandatory-hook MVP requirement.

A verified owned poster remains required. Native films still require a verified
owned main film; external films still use validated provider IDs. An attached hook
must remain verified, ready, owned by the creator, and between zero and 30 seconds.
The public publishing RPC signature, grants, identity checks and locking are unchanged.

Loop shows the poster and existing film/creator information and recommendation
controls when no hook exists. It mounts no preview video or sound/play-preview
controls for those cards and does not synthesize hook-watch events. Films with
hooks retain their existing preview behavior. Full-film playback remains available.

Migration: `20261019050313_optional_discovery_hook.sql`. No columns, RPC signatures
or generated database types change. A guarded replacement refuses to run if the
previous publication predicate has drifted. Existing media and films are unchanged.

Verification: transactional native/external publication, guest-feed inclusion, valid
hook retention, missing-poster/main-film rejection, invalid/unready-hook rejection,
anonymous and cross-user denial. Fixtures and migration changes were rolled back
for pre-apply testing. Run `supabase/tests/optional-discovery-hook.sql` after apply.
