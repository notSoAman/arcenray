# Film credits direct listing release — 2026-10-30

## Released behavior

Registered collaborators added by a film owner now appear in film and profile credits immediately. There is no invitation, confirmation, decline, or pending state in the web or mobile product. Credit copy identifies these as filmmaker-supplied credits; the app does not imply independent verification.

## Production changes

- Applied Supabase migrations `20261029230827_list_film_credits_without_confirmation` and `20261029230952_reindex_legacy_listed_credits` to project `ropbxsnjtejfomnpdllf`. The backfill reindexed existing listed credits.
- Deployed the `index-entity` Edge Function with credit indexing no longer gated by legacy status.
- Deployed the web Worker to production and staging. Worker version: `0980fe3f-db59-4d93-ad8f-6b487daa64b9`.
- Retained legacy confirmation columns and historical values for compatibility/audit; new application flows and invitation RPCs no longer use them.

## Verification

- `pnpm test`, `pnpm check-types`, `pnpm lint`, and `pnpm --filter @repo/mobile build` passed.
- The OpenNext Cloudflare build and Wrangler dry run passed.
- Live SQL checks passed for retired RPCs, denied anonymous writes, authorized direct collaborator listing, ownership boundaries, search, and indexing. The index queue SQL checks passed.
- Supabase security advisor returned no findings. Performance advisor showed existing foreign-key/index recommendations.
- Production profile UI smoke check showed the profile sections and credits without invitation actions.

## Mobile release boundary

The Expo Android bundle exports successfully, and the mobile source is updated. This repository has no production EAS build profile/update channel and currently declares the development Android package `com.arcenray.mobile.dev`; therefore no store or OTA production release was available to publish as part of this change.
