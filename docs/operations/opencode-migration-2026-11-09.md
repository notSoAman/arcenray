# OpenCode Migration — 2026-11-09

## Summary

Consolidated all Codex work into OpenCode, achieved a green build, decommissioned Codex, and freed 16 GB of disk space.

## Deliverables

### 1. All unique Codex work on GitHub

| Branch | HEAD | Status |
|---|---|---|
| `codex/launch-prep-20261109` | `35db7e0` | Pushed (4 commits: mobile SEO/assets, web SEO, docs, inventory) |
| `codex/consolidation-20261109` | `b09d637` | Pushed (8 commits: merge of discovery-chat-loop-release, gitignore, lockfile, route fix, OpenCode config/skills) |
| `codex/discovery-chat-loop-release` | `7cade20` | Already on GitHub (14 commits ahead of main baseline) |

Total: 30 remote branches, all verified with `git ls-remote`.

### 2. One authoritative branch, clean working tree

- Active branch: `codex/consolidation-20261109`
- Working tree: clean
- `.gitignore`: includes `.release-discovery/`, `.playwright-mcp/`

### 3. Green build (post-migration)

| Check | Before | After |
|---|---|---|
| `pnpm test` | 13/13 pass | 13/13 pass |
| `pnpm lint` | pass | pass |
| `pnpm check-types` | 94 errors (TS2883) | 0 errors (fixed mobile route `/films/` → `/film/`) |
| `pnpm build` | — | 3/3 tasks succeed |

### 4. Storage freed

| Path | Before | After | Freed |
|---|---|---|---|
| `.release-discovery/` | 3.7 GB | 0 | 3.7 GB |
| `~/.codex/worktrees/` | 8.0 GB | 0 | 8.0 GB |
| `~/.codex/` (sessions, etc.) | 1.1 GB | 0 | 1.1 GB |
| `~/.config/Codex/` | 241 MB | 0 | 241 MB |
| `~/.cache/codex-runtimes/` | 1.7 GB | 0 | 1.7 GB |
| Build output (`.next`, `.turbo`, etc.) | ~250 MB | 0 | ~250 MB |
| pnpm store (prune) | — | — | 297 MB |
| **Total** | **~16 GB** | | **16 GB** |

Disk: 32 GB available → 48 GB available (174 GB filesystem).

### 5. Four project skills + `opencode.json`

Created `.opencode/skills/{arcenray-web,arcenray-mobile,arcenray-media,arcenray-ui}/SKILL.md` and minimal `opencode.json`. All committed to the consolidation branch.

### 6. Codex removal script

Script at `/tmp/opencode/arcenray-migration/remove-codex.sh` was reviewed and executed. All Codex artifacts removed:
- apt `chatgpt` package
- snap `codex` package
- `~/.config/Codex`, `~/.cache/codex-runtimes`, `~/.codex`
- `~/.local/bin/chatgpt`, desktop entries

### 7. Codex memories archived

`~/.codex/memories` and `~/.codex/memories_v2` copied to `~/.config/opencode/memory/codex-archive-2026-11-09/`. Sessions and thread history (357 MB) were discarded per founder decision.

## Decisions Made

### Credit model

**Decision:** Pure listed credits (no recipient confirmation). Matches AGENTS.md update.

- Applied `8d710d4 Remove credit confirmation workflow` from `.release-discovery`
- Dropped `get_my_credit_invitations`, `invite_film_credit`, `respond_to_credit` (complex versions)
- Migration `20261029230827_list_film_credits_without_confirmation.sql` applied
- Migration `20261029230952_reindex_legacy_listed_credits.sql` applied
- Removed `credit-invitations.tsx`, `apps/web/app/(app)/invitations/`, `apps/mobile/app/invitations.tsx`, `profile-actions.tsx`
- Film credits are now filmmaker-supplied and immediate; no accept/decline flow

### Route fix

Fixed mobile `app/(tabs)/loop.tsx` route path from `/films/${film.id}` to `/film/${film.id}` to match Expo Router's generated types.

## Safety Net

All artifacts in `/tmp/opencode/arcenray-migration/`:

- `before-df.txt`, `after-df.txt`, `before-du.txt`, `after-du.txt`
- `git-status-main.txt`, `git-log-main.txt`
- `main-dirty.patch`, `main-untracked.tar.gz`, `main-checkout.bundle` (2.9 MB)
- `release-discovery.bundle` (3.4 MB), `release-discovery-audit/`
- `worktree-audit/<name>/` for all 8 worktrees (binary patches + untracked files)
- `remove-codex.sh`
- `docs/operations/codex-work-inventory-2026-11-09.md` (committed to branch)

## Unresolved / Follow-up

- **Credit accept mechanism:** User expressed interest in a lightweight accept step for registered-user credits (A). Deferred to follow-up; current implementation is pure listed (B).
- **AGENTS.md conflict:** AGENTS.md was updated during session to say "no confirmation". User's chat initially said "A" but then chose "simplest plan" (B) which matches AGENTS.md.
- **Global gitconfig credential helper:** `~/.gitconfig` still references `/tmp/arcenray-gh` (Codex artifact). The repo's `origin` remote URL was switched to SSH for this session; the global entry should be cleaned up separately.
- **Many stale branches:** 30 remote branches exist; many can be deleted post-consolidation (e.g., merged worktree branches).
