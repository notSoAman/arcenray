# Film credits

Film owners may add registered creatives or freeform names directly to a film's
credits. Registered creatives are linked to their public profiles immediately;
there is no recipient invitation, confirmation or verification workflow. Credits
are supplied by the filmmaker and Arcenray does not independently certify them.

Only the film owner may add or remove credits. RLS validates the film and linked
profile availability. Credit changes invalidate film/profile embeddings and
published credits are included in public profile and search results. Draft film
visibility and media access remain unchanged.

The legacy `verification_state`, `verified_by` and `verified_at` columns are kept
for existing record compatibility and audit history. They no longer determine
visibility, indexing or client behavior. New records default to the legacy
`accepted` value; clients must not read or write these fields.

The former invitation contract is archived in
[`location-credit-invitations-2026-10-20.md`](../operations/location-credit-invitations-2026-10-20.md).
