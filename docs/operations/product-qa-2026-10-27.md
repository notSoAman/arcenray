# Product QA — 27 October 2026

Branch: `codex/full-product-qa`. The pre-existing edit to `apps/web/AGENTS.md` is outside this work.

- Root tests (including mobile), lint, types and build passed. The processor suite passed 18 tests with one R2 SDK test skipped locally; the added capacity regression passed.
- The live guest web security smoke passed. A disposable live backend test passed authentication, draft and chat access controls, indexing/search, direct R2 upload, server processing, publication, CDN Range playback and cleanup. It uses legacy Supabase test users, not a Clerk or mobile sign-in.
- A compatible 92 MB supplied film was preserved byte-for-byte by the local processor. A five-second AV1/Opus excerpt from another supplied film was transcoded to H.264/AAC locally.
- The linked database multipart test found an ambiguous PL/pgSQL alias. Migration `20261027164734` fixes only that query and was tested in a rolled-back transaction, applied via the linked SQL API, recorded in migration history, and tested again. Supabase security advisors returned no issues. The linked migration history already differed from this checkout: remote `20261025010641` versus local `20261025090000`; do not run a blind migration push until reconciled.
- Corrected stale SQL test expectations for 64 MiB parts and the current outer multipart ceiling. This ceiling is not a promise that the worker has capacity for a file of that size.
- The worker's free-space calculation now subtracts its operating-system reserve even on a partly occupied disk. This code change is local and has not been installed on Oracle.

Outstanding: real Clerk sign-in and authenticated web/mobile journeys; actual mobile multipart upload, interruptions and process recovery; physical-device tests; production multipart end-to-end upload after the SQL repair; Oracle host access, controlled concurrent load and recovery testing; deployment of the worker reserve fix; full feature and accessibility coverage. An Android emulator attempt was stopped because it raised its allocation to 4 GiB and left about 2 GiB host memory available. No Oracle capacity figure is claimed.
