> Historical handoff: the Claude design implementation is merged in PR #4.
> Founder + Codex now owns all development through launch. Authentication instructions
> below predate Clerk; use [the current auth contract](architecture/clerk-auth.md).
> Do not use old Supabase Auth sign-in examples or request the founder's `.env.test`.

# Arcenray: friend + Claude Code setup

This guide is for the design lead working on the web frontend. The repository is
private: the founder must grant your GitHub account repository access first. Use
your own GitHub and Claude accounts; no founder account logins are needed.

## 1. Clone and run

Install Git, Node.js24+ and Claude Code using its
[official installation guide](https://code.claude.com/docs/en/setup).
Run `claude --version` to verify installation and sign in with your own account.
Use the pinned pnpm version from this repository:

```sh
npm install --global pnpm@11.25.0
git clone https://github.com/notSoAman/arcenray.git
cd arcenray
git switch codex/project-backup
git pull --ff-only
git switch -c feat/claude-web-onboarding
pnpm install --frozen-lockfile
pnpm setup:web
pnpm --filter web dev
```

Open http://localhost:3000. Keep port3000 and use localhost: the current callbacks
and upload CORS allow this origin. If it is busy, stop your own conflicting process;
ask the founder before introducing another origin. Do not add new cloud config.
The current homepage is still the original Next.js scaffold, not completed product UI.

The unusual name `codex/project-backup` is the actual GitHub default branch. Do not
assume a main/master branch, reinitialize the repo, or create a replacement project.
Backend and browser media work are merged there. Create one short-lived branch per
bounded task, push it and open a PR targeting `codex/project-backup`; the founder
reviews/merges. Before a new task, switch to that base and pull with `--ff-only`.

## 2. Environment files: do not request .env.test

**The founder should not send `.env.test`.** It contains privileged backend/testing
credentials. Do not copy it, request service-role keys/R2 credentials, or log in to the
founder's Supabase/Cloudflare account.

`pnpm setup:web` creates Git-ignored `apps/web/.env.local` from the committed public
configuration in `docs/backend/project.json`. It contains only:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<public-project-url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<public-publishable-key>
NEXT_PUBLIC_MEDIA_URL=<public-cdn-url>
```

These public settings let the frontend talk to the hosted API. The app user signs
in normally, and RLS enforces access. Upload signatures and trusted actions come
from the deployed authenticated functions; the browser never needs R2 keys. Supabase
built-in gte-small handles embeddings, so no OpenAI account/key is needed.

Setup preserves an existing `.env.local`. If yours points at another project, inspect
it and consciously choose the founder-approved target. Do not upload any `.env*` file
to GitHub; examples contain placeholders only. A separate local/staging project can
be configured later with the founder's supplied public settings.

The default hosted project is **shared**, not a disposable local database. Use your
own regular test app account and only founder-approved disposable media. Do not run
`pnpm backend:smoke`, schema push/reset, cloud CLI login, deployments, or admin SQL.
Google OAuth and production SMTP are still pending founder configuration. Build honest
unavailable/error states; do not disable email confirmations or fake a logged-in user
to conceal delivery/provider failures. API documentation is not proof that every
end-user screen or provider configuration is finished.

## 3. Read these files in Claude Code

From the repository root, launch `claude`. Root `CLAUDE.md` points to `AGENTS.md`.
Read, in order:

1. `AGENTS.md` and `CLAUDE.md`.
2. `docs/design/README.md` and the linked design artifact (with required owner access).
3. `docs/backend/FRONTEND_HANDOFF.md` and `docs/backend/STATUS.md`.
4. `docs/architecture/backend-contract.md` and `docs/architecture/browser-media.md`.
5. `packages/shared/src/client.ts`, contracts/types, and the existing web auth/media code.

The design source has not been exported into this repository. If the artifact cannot
be opened, ask the founder/design owner for its code, screenshots, logo exports and
tokens before claiming fidelity. Do not invent a replacement brand or add stories.
The web workspace has no `@/` alias configured; use valid relative imports or propose
an explicit local alias change in the UI PR. Do not blindly paste illustrative imports.

## 4. Connectors/plugins

No MCP server or plugin is mandatory to run or build the frontend. Claude Code already
edits local files and runs terminal commands. You need authenticated Git for the private
repo; the GitHub CLI (`gh auth login`) is optional for convenient PR creation. A GitHub
MCP connector is optional and not a substitute for Git authentication.

| Tool                          | Recommendation                                             | Access                                                |
| ----------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| Git/GitHub                    | Required for cloning/pushing; use your own invited account | Repository access only                                |
| Claude Code                   | Required for this agent workflow; own account              | Local repository                                      |
| Playwright MCP                | Optional, useful for browser inspection and screenshots    | Own browser test session; no cloud admin login        |
| Supabase MCP                  | Skip initially; SDK/contracts suffice                      | Optional later, approved dev/staging scope, read-only |
| Cloudflare MCP/Wrangler login | Not needed for UI work                                     | Founder-owned operations                              |
| OpenAI connector/key          | Not needed                                                 | Embeddings run in Supabase                            |
| Other plugins/agent skills    | Not required                                               | Ask before new project dependencies/config            |

Optional browser MCP, run in the repo (local scope keeps the configuration personal):

```sh
claude mcp add --scope local playwright -- npx -y @playwright/mcp@latest
claude
```

Inside Claude, use `/mcp` to inspect connection status. Follow the tool's browser
installation instructions if prompted. Use its separate test browser, not a founder
cloud-admin session. The command follows [Microsoft's Playwright MCP server](https://github.com/microsoft/playwright-mcp)
and [Claude MCP scopes](https://code.claude.com/docs/en/mcp).

Only if the founder later authorizes access to a particular development project:

```sh
claude mcp add --scope local --transport http supabase "https://mcp.supabase.com/mcp?project_ref=APPROVED_DEV_PROJECT_REF&read_only=true&features=database%2Cdocs"
claude
```

Replace the placeholder with the approved project ref, then use `/mcp` in Claude to
complete OAuth with your own invited account. Do not borrow tokens or grant yourself
permissions. Read-only SQL can still read sensitive rows, so founder approval and
project scope matter; it is not a per-user RLS sandbox. The founder has not granted
this additional account access merely by sharing the repo. See [Supabase MCP configuration](https://supabase.com/docs/guides/ai-tools/mcp).
Skills/plugin installation is separate from connecting accounts; root instructions
and the existing code are enough to start.

## 5. Copyable prompts — use one task at a time

### Prompt A: bootstrap and first real screen flow

```text
Read ./AGENTS.md, ./CLAUDE.md, docs/COLLABORATOR_SETUP.md, docs/design/README.md,
docs/backend/FRONTEND_HANDOFF.md, docs/backend/STATUS.md and both architecture
contracts before editing. You are Arcenray's design lead using Claude Code.

Inspect the existing Next.js App Router app, shared SDK and Supabase SSR clients.
Work on feat/claude-web-onboarding. Reserve your intended UI files in the PR.
Confirm the supplied Claude design artifact is accessible; if not, request its
exports/screenshots/tokens instead of inventing visual fidelity.

Implement a coherent first UI slice: email magic-link sign-in and callback/error
states, multi-role profile onboarding, and a real feed with loading/empty/error
states. Reuse the existing auth clients and createArcenrayClient. Do not present
Google login as available until the founder configures it. Do not fabricate a
working vibe-check/taste-seeding API: flag missing approved cards/contracts.
Preserve the approved cinematic design, responsive behavior, keyboard access and
reduced motion. Do not add stories or invent marketplace/music-streaming features.

Do not edit migrations, generated DB types, shared contracts, Edge Functions,
cloud/auth configuration, secrets or deployments. Report missing backend capability
as a concrete contract request to Codex. Do not request .env.test or admin keys.

Run pnpm test, pnpm lint, pnpm check-types and pnpm build. Browser-check the real
screens when possible, report any auth/provider blocker honestly, then push the
feature branch and open a PR against codex/project-backup with screenshots, checks
and remaining work. Do not merge or deploy.
```

### Prompt B: publish and playback (after the first UI contract is integrated)

```text
Read the Arcenray instructions and current frontend/media handoff. Use a fresh
feature branch from the latest default branch and confirm file ownership.
Implement the approved creator publishing and watch screens against the real SDK:
native MP4 plus mandatory <=30-second hook and poster, image preparation, video
preflight, direct upload progress/cancel/retry, server verification, saved draft,
explicit publish, indexing with nonblocking retry, discovery and playback. Reuse
apps/web/lib/media; do not proxy movie bytes through Next.js or invent transcoding.
Include quota/error/empty/unsupported-format states. External Vimeo/YouTube films
use validated IDs and the creator's own hook/poster, never downloaded films.
No schema/cloud/contract/design-system changes without the designated owner's
approval. Test and browser-check, push a PR with screenshots and clear limitations;
do not merge/deploy. List anything needing Codex as a specific contract request.
```

### Prompt C: search, profiles and collaboration

```text
Read the latest Arcenray instructions and handoff. On a fresh, scoped feature
branch implement approved film/people search with exact city/role/genre filters,
creator profiles and filmmaker-supplied credits, and contextual one-to-one inbox/chat via
the existing SDK and Supabase Realtime. Distinguish loading, empty, blocked,
signed-out and error states. Use stable message IDs and clean up subscriptions.
Do not implement unrestricted private Broadcast/typing/presence: that authorization
is not available yet. Do not invent a jobs marketplace or change backend contracts.
Run existing checks and browser QA, push a PR with screenshots, and report any
missing API to Codex. Founder reviews/merges; do not deploy.
```

## 6. Checks and returning work

From the root (no backend secrets needed):

```sh
pnpm test
pnpm lint
pnpm check-types
pnpm build
```

There are currently21 tests:4 contracts,10 server media parser,7 upload-state cases.
Optional `pnpm test:browser-media` needs Chrome and FFmpeg, uses isolated local
fixtures and no cloud credentials. `CHROME_BIN` can point to your Chrome executable.
This optional browser harness is separate from Playwright MCP.

Push only your feature branch and open a PR against `codex/project-backup`. Include
changed screens/files, behavior, screenshots, checks (including what was not run),
contract requests and known limitations. Send the PR URL to the founder; do not merge.
Never commit private credentials or `.claude/settings.local.json`. Local MCP setup
above is stored outside the repo. No CI workflow, mobile app or production web
hosting is configured by this handoff; do not claim those are ready.

## Founder checklist before sending this guide

- Invite the friend's own GitHub account to this private repository; they accept it.
- Share this guide and access to the actual design artifact/exports/approved logo.
- Keep `.env.test`, R2/service-role/cleanup secrets, passwords and cloud logins private.
- Agree which UI files the friend owns while Codex continues backend work.
- Arrange a regular test app account and scoped disposable-media testing. If hosted
  email sign-in blocks testing, handle it as founder-side auth/email configuration.
- Review/merge their PRs; Google OAuth, production SMTP, hosting, CI, moderation and
  pilot readiness remain separately controlled work, not prerequisites for drawing UI.
