# Codex Work Inventory — 2026-11-09

Snapshot taken at the start of the Codex → OpenCode migration session.
All claims verified against live `git` state, not the prompt's summary.

## Starting state corrections

The prompt's "Starting state" had several inaccuracies. The verified reality:

| Claim in prompt | Verified reality |
|---|---|
| `.release-discovery` is "not on GitHub" because its `origin` points locally | **Already on GitHub** at `7cade20` under `refs/heads/codex/discovery-chat-loop-release` (same SHA as the local clone's HEAD). Someone pushed it independently. |
| `automatic-media-compression` has "0 unique commits vs `2f3841b`" | Has 2 commits (`2f4f348`, `ba3a195`) that are byte-identical to main's `5552adb` and `a50aed0` (rebased during `2f3841b` merge reconciliation). **No unique content.** |
| 8 registered worktrees | **8 active + 1 prunable** (`/tmp/arcenray-pr16` dir no longer exists, ref is stale) |
| pnpm mismatch (local 12.11.2 vs pinned 11.25.0) | **No mismatch.** `pnpm --version` reports 11.25.0 — the pinned version. |
| `mobile-play-testing` 6.2 GB | 7.4 GB (mostly `node_modules` + Expo/Android build artifacts) |
| `~/.codex` 9.0 GB | 7.3 GB |
| `film-preflight-release` / `onboarding-publish-ux` worktrees | HEADs are **ancestors** of `2f3841b` (behind main, not ahead) — stale, safe to discard |
| `codex/full-product-qa` | Diverged: local at `5e46662` (ancestor of `2f3841b`), remote at `faa3176` (PR #18 merge, subsumed by `2f3841b`) |
| local `main` branch | Stale at initial commit `d3fa3fe` — actual work lives on feature branches |

## Authoritative commit coverage map

### On GitHub already (30 remote branches)

All worktree branches already existed on `origin`:

- `codex/discovery-chat-loop-release` @ `7cade20` — 14 commits ahead of `2f3841b`, clean tree. Includes `8d710d4 Remove credit confirmation workflow`, chat-media, search relevance, published-film edit fixes, voice notes, identity search, Android microphone permission.
- `codex/robust-upload-publish` @ `337dbdd` — all 11 commits subsumed by `.release-discovery`
- `codex/seo-brand-repair` @ `7fba484` — all 4 commits subsumed by `.release-discovery`
- `codex/remove-credit-confirmation` @ `8d710d4` — all 2 commits subsumed by `.release-discovery`
- `codex/automatic-media-compression` @ `ba3a195` — 2 commits, byte-identical to main's `5552adb` and `a50aed0`
- `codex/film-preflight-release` @ `ae5c806` — ancestor of main
- `codex/onboarding-publish-ux` @ `e15f0f7` — ancestor of main
- 18 other `codex/*` branches (already merged or standalone)

### NOT on GitHub before this session

- **Main dirty tree (21 paths)** — production EAS profile, Expo dep bumps, store assets, SEO metadata, learning guide
- `codex/mobile-play-testing` local ref (HEAD `2f3841b` + 11 dirty paths) — never pushed

## What was preserved

### Phase 1 commit: `codex/launch-prep-20261109` (pushed to GitHub)

Branch at `5d043f9` on GitHub, 3 coherent commits from the main checkout's dirty state:

1. **`cbc82b2` feat(mobile): production EAS profile, Expo bumps, store assets and player refinements**
   - `apps/mobile/eas.json` — production EAS build profile
   - `apps/mobile/package.json` — Expo 58.0.x patch bumps (router, auth-session, file-system, etc.)
   - `apps/mobile/README.md` — setup notes
   - `apps/mobile/turbo.json` — pipeline entry
   - `apps/mobile/src/player.tsx` — player behavior
   - `apps/mobile/app.config.ts` — dynamic Expo config (new file)
   - `apps/mobile/assets/adaptive-icon.png`, `icon.png` (new files)
   - `apps/mobile/assets/store/feature-graphic.png`, `play-icon.png`, `screenshots/phone-film-discovery.png`, `screenshots/phone-home.png` (new files)
   - `pnpm-lock.yaml` — regenerated

2. **`0117e9b` feat(web): SEO metadata, sitemap, robots.txt and discovery page refinements**
   - `apps/web/app/layout.tsx` — metadataBase + title/description refinement
   - `apps/web/app/page.tsx` — structured landing metadata
   - `apps/web/app/robots.ts` (new file)
   - `apps/web/app/sitemap.ts` (new file)
   - `apps/web/app/(app)/films/[id]/page.tsx`, `home/page.tsx`, `loop/page.tsx`, `u/[handle]/page.tsx` — route metadata

3. **`5d043f9` docs: substantially expand LEARNING_GUIDE.md**
   - `docs/LEARNING_GUIDE.md` — +276 / −69 lines

### Deliberately NOT committed

- `.playwright-mcp/` — local Playwright MCP artifact
- `.release-discovery/` — separate clone; its branch is already on GitHub
- `main-checkout.bundle` — accidental; removed from repo root
- `.env*`, build output, node_modules

### Safety net artifacts (local, `/tmp/opencode/arcenray-migration/`)

| File | Size | Purpose |
|---|---|---|
| `before-df.txt` | 93 B | Disk state before changes |
| `before-du.txt` | 234 B | Directory sizes before changes |
| `git-status-main.txt`, `git-log-main.txt` | ~1.2 K each | Pre-change state snapshots |
| `main-dirty.patch` | 190 K | Binary patch of the 21 dirty tracked paths (pre-commit) |
| `main-untracked.tar.gz` | 1.2 M | Tarball of 9 untracked non-build files |
| `main-checkout.bundle` | 2.9 M | Bundle of `codex/upload-performance-recovery` (committed state) |
| `release-discovery.bundle` | 3.4 M | Bundle of `.release-discovery`'s `codex/discovery-chat-loop-release` |
| `release-discovery-audit/{commits,diff-stat,head}.txt` | ~8 K | Audit of `.release-discovery` |
| `worktree-audit/<name>/{head,status,ahead-of-main,behind-main,committed-diff,dirty,untracked}.txt` | ~1 K each × 8 | Worktree audit metadata |
| `worktree-audit/<name>/dirty.patch` | 28 K – 180 K | Binary patches of dirty work in `android-parity`, `automatic-media-compression`, `mobile-play-testing` |
| `worktree-audit/<name>/untracked-files/` | 20 K – 100 K | Copies of non-build untracked files from dirty worktrees |

## Dirty worktree summary

Only 3 of 8 worktrees had uncommitted work:

| Worktree | HEAD | Dirty paths | Unique content? |
|---|---|---|---|
| `android-parity` | `2f3841b` | 6 (incl. `processing-status.ts`) | All in patch |
| `automatic-media-compression` | `ba3a195` | 29 (incl. FFmpeg processor, migration, Docker setup) | 2 "unique" commits = byte-identical to main `5552adb`/`a50aed0`. 29 dirty paths captured in patch. |
| `mobile-play-testing` | `2f3841b` | 11 (incl. `build-play-aab.mjs`, mobile parity doc) | All in patch |

The remaining 5 worktrees (`film-preflight-release`, `onboarding-publish-ux`, `remove-credit-confirmation`, `robust-upload-publish`, `seo-brand-repair`) had **no dirty state and no unique commits** not already on GitHub.

## Credit-model conflict (Phase 2 — UNRESOLVED)

Two contradictory credit models exist:

- **Main (`2f3841b`)**: film owner invites collaborator → recipient accepts/declines → `get_my_credit_invitations`, `respond_to_credit`, `credit-invitations.tsx`
- **Branch `codex/discovery-chat-loop-release` (`8d710d4`, 2026-10-30)**: confirmation workflow removed in favor of listed credits; migrations `20261029230827_list_film_credits_without_confirmation.sql` and `20261029230952_reindex_legacy_listed_credits.sql`

**Awaiting founder decision on which model is canonical before Phase 2 merge.**

## Other observations

- Local `~/.gitconfig` has a broken credential helper `!/tmp/arcenray-gh auth git-credential` (Codex artifact, file no longer exists). The repo's `origin` remote URL has been switched to SSH (`git@github.com:notSoAman/arcenray.git`) for this session. The global config entry still needs cleanup (out of scope for this repo; document in final report).
- 30 branches on GitHub is a lot. After consolidation, many can be deleted.
