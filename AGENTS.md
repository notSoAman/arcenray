# Arcenray — Master Agent Instructions

> **Repository-wide instructions for Codex, Claude Code, Antigravity, and any future coding agent.**
> **Status:** MVP engineering contract. **Founder update 2026-10-17:** Codex owns frontend and backend through launch; Clerk replaces Supabase Auth for new web sessions. See `docs/architecture/clerk-auth.md`. Applies from the repository root to every workspace unless a narrower instruction explicitly approved by the project owner adds constraints.
> **Project owner / final technical approver:** Arcenray founder using **Codex**.
> **Accepted design source:** Collaborator using **Claude Code**; implementation ownership is now Codex through launch.
> **Current ownership:** Codex owns all implementation, including UI integration, through launch. Historical team sections below describe earlier roles; founder updates take precedence.
> **Auxiliary agent:** **Antigravity (Flash 3.8)** for small, bounded tasks.

## 0. First-read protocol

Before editing anything:

1. Read this file, the root `package.json`, `pnpm-workspace.yaml`, the relevant workspace, and recent project decisions/PR descriptions. If a mentioned file or package does not exist, **report that**; do not pretend it does.
2. Examine the existing implementation before proposing new frameworks, directories, dependencies, or architecture.
3. State which agent role you are operating as, the intended files, dependencies, risks, and acceptance criteria. Keep the plan proportional to the task.
4. Work in a feature branch or isolated worktree, not directly on `main`, unless the founder explicitly directs otherwise.
5. Make the smallest coherent, testable change. Document assumptions rather than silently filling gaps.
6. Run relevant checks and report results truthfully. Never claim a build, deployment, preview, or live integration was verified when it was not.
7. **Stop and request founder approval** for irreversible, high-cost, security-sensitive, architectural, database-contract, account, or production changes.

**Instruction priority:** direct, current instructions from the founder > this file > approved architecture decisions and shared interface contracts > accepted design artifacts > feature-specific tickets > suggestions in old conversations. If two authoritative sources conflict, stop and ask rather than guessing.

**Important history:** Previous Arcenray planning considered Cloudflare D1/Vectorize/Queues/Durable Objects, central Vimeo hosting, and Bunny Stream. **Those are superseded proposals**, not the current default stack. Do not resurrect them without an approved architecture decision.

---

## 1. Product identity and MVP goal

**Arcenray** (previously Lumiere) is a creator-first platform for **independent filmmaking and music collaboration**: discover short films and creative people, showcase work, build credible portfolios and film-credit networks, and connect with collaborators or hiring opportunities.

**Brand promise:** **“FIND YOUR PEOPLE, MAKE YOUR ART.”**

- **Target initial audience:** roughly **1,000 users or fewer**, beginning with an impressive, credible MVP for product feedback, demonstrations, and potential investors.
- **Primary product:** short-film discovery + filmmaker/crew/musician discovery + collaboration. Musicians, composers, producers, sound designers, editors, writers, DOPs, actors, directors, etc. are valid **multi-role profiles**. A separate Spotify-like music-streaming catalog is **not** automatically in scope.
- **MVP business model:** **no ads, subscription plans, in-app payments, payment gateway, or platform commissions**. Do not introduce monetization SDKs.
- **Quality bar:** cinematic, smooth, mobile-conscious, accessible, polished; optimize for a small real user base rather than speculative massive scale. “Lean” must not mean fake core features or insecure shortcuts.
- **Visual direction:** clean, minimal, sharp, cinematic; mostly black and white with restrained soft/frosted prismatic rainbow accents. The accepted Arcenray logo direction is a smaller lowercase **a** and a solid uppercase **R**. **Claude's approved artifacts, not this short description, determine detailed appearance.**
- **Core experiences:** authentication/onboarding; searchable multi-role creative profiles; film publishing/import; short hook discovery; full playback; hybrid search; near-real-time personalization; film credits and collaboration graph; one-to-one messages; basic creator/contact and opportunity discovery flows.
- **Web and mobile:** Next.js web app and Expo mobile app should share contracts and behavior. Ship a strong end-to-end vertical slice before attempting simultaneous broad coverage of both apps. Do not hand the mobile architecture to the auxiliary agent by default.

### Explicitly unresolved product decisions

The original stack discussion does **not** finalize a complete jobs/gigs/applications schema, a full moderation workflow, a native music-content catalog, or a detailed mobile release date. Preserve extension points, but **ask the founder for a scoped decision before building a large marketplace, hiring/payment system, or separate music-streaming product**. At minimum, profiles, credits and chat must permit meaningful collaboration.

---

## 2. Team governance and decision rights

| Role                                                       | Scope and default ownership                                                                                                                                                                                                                                     | Authority / limitations                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Founder + Codex — primary driver / technical lead**      | Repository root, architectural decisions, package/contract coordination, Supabase schema/review, authentication/security, Supabase Edge Functions, Cloudflare R2, media integration, performance, CI/CD, environments, deployments, releases, final code review | **Only this role** authorizes production actions, cloud resource changes, paid services, new credentials, breaking contracts, migrations against shared/production DBs, and merges to `main`. Codex may work across any package when required, but coordinates edits to Claude-owned UI. |
| **Friend + Claude Code — design lead / UI implementation** | Design artifacts, design tokens, layouts, interaction/animation direction, accessibility and visual QA; primarily `apps/web` presentation components/routes and, when assigned, mobile UI design references                                                     | **Design direction and product visual consistency are led here.** Claude proposes and implements UI, consumes shared interfaces, and flags missing APIs. Claude **does not** independently change DB tables, auth policy, cloud config, API contracts, secrets, or production resources. |
| **Founder + Antigravity Flash 3.8 — auxiliary execution**  | Founder-assigned small tasks: isolated components/styling based on approved tokens, responsive fixes, test cases, fixtures, documentation, simple CRUD wiring against stable interfaces, accessibility checks, browser smoke tests                              | **No independent architecture.** No auth, RLS, schema, billing, cloud, production, secret handling, or large multi-package rewrites. Prefer one task/PR at a time with tight file boundaries.                                                                                            |

### Golden rules for collaboration

- **One human decision-maker for architecture and releases:** the founder. Agent confidence is not authorization.
- **One visual source of truth:** Claude's accepted design artifacts/tokens. Do not improvise a competing design system or replace the brand identity.
- **One technical source of truth:** version-controlled migrations, generated DB types, approved contracts, and recorded decisions. Do not maintain competing schemas in agent prompts.
- **No simultaneous editing of the same feature/files.** Explicitly reserve task/file ownership in an issue or PR description; coordinate before overlaps.
- When a UI request needs a schema/API change, **Claude opens a contract request** (desired fields, payload, states, edge cases). **Codex owns and reviews the contract change**; then Claude integrates.
- Antigravity's outputs require review by **Codex for behavior/security** and **Claude for appearance** when design-bearing.
- Any agent may **raise** a concern about correctness, accessibility, privacy, or security. No agent may silently bypass a control in order to finish quickly.

### Claude Code bootstrap

Claude Code normally loads root `CLAUDE.md`, not necessarily `AGENTS.md` automatically. Keep a **small root `CLAUDE.md` pointing to this file**, without duplicating requirements. Start Claude sessions with: **“Read `./AGENTS.md` and the accepted design references before making changes.”** Antigravity should receive the same explicit instruction unless its current environment demonstrably loads this file.

---

## 3. Approved architecture: lean hybrid Supabase + Cloudflare

**Use the existing repository first; these are target choices, not permission to overwrite an initialized codebase.**

| Layer                    | MVP choice                                                                                                                      | Notes                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo                 | **pnpm + Turborepo + TypeScript**                                                                                               | Shared linting, type checks, types, schemas and APIs.                                                                                                                 |
| Web                      | **Next.js App Router**, Tailwind CSS, a restrained motion library, Clerk + Supabase token adapters, TanStack Query where useful | Server/client separation; good load states and media performance.                                                                                                     |
| Mobile                   | **Expo Router / React Native**, `expo-video`, `expo-secure-store`, Supabase JS                                                  | Reuse contracts and business behavior, **not** web DOM components.                                                                                                    |
| Relational data + search | **Supabase PostgreSQL** + **pgvector** + PostgreSQL full-text search (`tsvector`) + SQL                                         | Migrations under `supabase/migrations`. No D1 or MongoDB as the primary store.                                                                                        |
| Identity                 | **Clerk** (Google, Apple, email, phone and username)                                                                            | Web via Clerk Next.js SDK and native Supabase third-party JWT trust. Preserve UUID ownership with private issuer/subject mapping; mobile integration remains pending. |
| Live communication       | **Supabase Realtime** + Postgres persistence/RLS                                                                                | Chat delivery, ephemeral typing and presence. No custom Durable Objects by default.                                                                                   |
| Media                    | **Cloudflare R2**                                                                                                               | Main film MP4, hook clip, poster and compact profile picture. Direct authenticated, authorized uploads; no full movie bytes through serverless API functions.         |
| Semantic embeddings      | **Supabase Edge Runtime `gte-small`, 384 dimensions (English, max 512 tokens)**, server-side only                               | Index films and profiles. Provider changes require founder approval and coordinated dimension/index migration.                                                        |
| Cloud operations         | **Supabase Edge Functions** for narrow trusted actions; Cloudflare CDN/Workers only if justified                                | Avoid building a separate service/API layer by default. Host the web app on a platform compatible with the selected Next.js features; founder approves hosting.       |
| Product telemetry        | Minimal consent-aware event capture; optional analytics only if approved                                                        | No user surveillance SDK added just for investor demos.                                                                                                               |

### Target repository layout

```text
/
├── AGENTS.md                    # This master contract
├── CLAUDE.md                    # Thin pointer to AGENTS.md for Claude Code
├── apps/
│   ├── web/                    # Next.js App Router web product
│   │   └── src/lib/media/      # Client media inspection, conversion, uploads
│   └── mobile/                 # Expo React Native product (when initialized)
├── packages/
│   └── shared/                 # Generated DB TS types, public DTOs, Zod contracts
├── supabase/
│   ├── migrations/             # Versioned PostgreSQL schema, functions, RLS
│   └── functions/              # presign-upload, index-entity, narrow backend ops
├── docs/
│   ├── architecture/           # Approved decisions and interface contracts
│   └── design/                 # Links/artifacts/tokens approved by design lead
└── .github/workflows/          # CI after founder approval
```

Create missing folders **only when needed**. Do not add `apps/api`, `packages/db`, an additional vector database, Kafka/Redis, Kubernetes, custom chat servers, or a new ORM merely because a generic template suggests them.

### Canonical integration boundaries

1. **Clients** authenticate via Clerk and query permitted data through RLS-backed operations / approved RPCs.
2. **Supabase PostgreSQL** stores the relational source of truth, full-text indexes, pgvector embeddings, moderation and publication states, and chat persistence.
3. **Supabase Edge Functions** perform authorization-sensitive tasks: R2 upload intents/signatures, trusted metadata validation, embedding API calls and reindex jobs. Secrets never enter the client.
4. **R2** stores media bytes and serves permitted assets via controlled public delivery/appropriate URLs. Database rows store durable **asset keys + metadata** where possible, not arbitrary unverified user-provided R2 URLs.
5. **Web and mobile** use shared typed DTOs/contracts, but have independent rendering and media implementations.

Do not assert a guaranteed 15 ms SQL query, 200 ms media start, zero total bandwidth cost, or fixed monthly bill. **Measure real behavior and verify current vendor limits, terms and pricing before relying on them.**

---

## 4. Core domain and database contracts

All database changes must be created as **versioned migrations**. The live dashboard is not the source of truth. Require founder review for new tables, altered ownership, access policies, vector dimensions, generated types, or RPC signatures.

### Required conceptual entities

- **`profiles`**: `id` as stable UUID linked through private trusted issuer/subject mappings, name, unique handle, bio, **`roles text[]`** (multiple creative roles), `location_city`, `skills_gear text[]`, `profile_pic` asset reference, `onboarding_completed`, **`embedding vector(384)`**, `taste_vector vector(384)`, full-text index, storage quota and reserved/used bytes as needed. Prefer a canonical roles taxonomy plus extensible labels.
- **`films`**: creator ownership, title, synopsis, genres, mood tags, city/location when meaningful, source (`r2_native`, `vimeo_embed`, `youtube_embed`), provider ID / external URL or internal asset key, `poster`, **mandatory discovery hook**, hook duration **`<= 30 seconds`**, film duration, visibility/publication/processing state, `embedding vector(384)`, full-text index and timestamps. Do not require a native R2 video asset for external-linked films.
- **`film_credits`**: film, credited creative (if registered), role/department, claim/invitation status, **verification state and verifier/audit record**. A user cannot grant themselves a verified credit by changing client-supplied flags.
- **`user_events`**: actor, event kind, film or target, meaningful dwell/watch data, timestamp, stable idempotency/deduplication identifier. Restrict and minimize tracking; no raw video/audio logging.
- **`conversations`, `conversation_participants`, `messages`** (or an equivalently secure simple 1:1 design): participant membership, sender, message body, timestamps, optional attachment reference to a film/collaboration item, moderation/delete state where appropriate.
- Supporting likes/bookmarks, reports, opportunity listings and applications should be introduced as **small normalized tables when their workflows are approved**, not embedded as unbounded JSON blobs or guessed into existence.

**Schema caveat:** The planning PDF proposed `full_name NOT NULL` and `handle NOT NULL` alongside automatic profile creation on signup. Those may conflict with OAuth/magic-link signup before onboarding. **Implement a safe pending-onboarding state or generated placeholder handle; do not ship a broken auth trigger.**

### Row-level security is non-negotiable

- Enable and test RLS on **every user-content table** before exposing it from clients.
- Public reads must be limited to deliberately public/published profile, credit and film fields. Drafts, private messages and sensitive metadata must not leak through broad `SELECT`.
- Users may edit **their own** profile/media/film drafts; chat participants may read/write **their own** conversation messages. No one can arbitrarily join a conversation, impersonate a sender, or modify another user's storage usage/verification data.
- Privileged writes (usage counters, verification, publishing pipeline, indexing) happen via trusted transactional functions or Edge Functions with explicit authorization.
- For `SECURITY DEFINER` SQL RPCs: fix `search_path`, explicitly check `private.current_profile_id()`, validate access and parameters, and restrict grants. **Never accept a client-controlled `p_user_id` as authority over another user's taste/profile.**
- Include negative security tests: unauthenticated access, cross-user edits, guessed conversation IDs, unauthorized credit verification and quota bypass.

### Stable service contracts (names are targets, not permission to break existing ones)

- `presign-upload`: validates user/session, file type/size/intent, remaining quota and safe object path; returns short-lived presigned upload details. Verify completed upload **server-side** before declaring it published/charging final usage. Support large-file multipart/resumable upload if normal direct PUT cannot meet file-size/reliability needs. Prevent upload-intent races by reservation/transactional accounting.
- `index-entity`: asynchronously computes a 384-dimensional embedding for a film or profile **after authorization and relevant edits**; supports retries, deduplication and reindexing after verified credits change.
- `update_user_taste_vector`: updates **only the authenticated user's** taste vector from a permitted event and an indexed film. Treat weights as tunable defaults, not immutable ML science.
- `get_personalized_feed`: ranks publishable films for current user, filters blocked/unavailable/already-consumed content as appropriate, and has sensible cold-start/popularity/recency fallback.
- `hybrid_search`: searches people/films across embeddings and full-text results with structured city/role/genre filters; initial scoring experiment **0.7 semantic / 0.3 text** after normalization. Never rely on vector match alone for exact filters.

**Data contract workflow:** migrate -> RLS/SQL tests -> regenerate TypeScript types in `packages/shared` -> update shared Zod/DTOs -> update web/mobile callers -> run CI -> obtain founder approval -> deploy using reviewed procedure.

---

## 5. Product flows agents must preserve

### A. Authentication and onboarding

1. Clerk sign-in (Google, Apple, email, phone and username as configured).
2. Multi-role selection (e.g. director + editor + colorist), city, bio and skills/gear; upload compact profile picture.
3. **12-card visual vibe check:** choose **3** mood/film references. Use precomputed embeddings or a safe preference fallback to seed taste; do not block signup forever if embedding service is unavailable.
4. Show a useful personalized or fallback feed immediately; no unexplained blank feed.

### B. Publish a short film

Two obvious methods in one creator-friendly flow:

- **Native film upload to Arcenray:** choose file -> inspect format/quality -> smart client compression when appropriate -> create/select hook and poster -> validate quota -> direct upload to R2 -> verify completion -> write metadata/credits as a draft -> index -> publish when assets are ready. Provide honest progress, retries, errors and cancellation.
- **External film link:** paste a **Vimeo (preferred)** or **YouTube** link -> validate supported provider URL -> fetch allowed metadata -> creator supplies or uploads their **own <=30-second hook** and poster -> index metadata -> play via compliant embed. **Never scrape, rehost, cut or download third-party films just to generate a preview without authorization.** Never promise external embeds have no ads or restrictions.

Do not force filmmakers to leave Arcenray, sign up for a Vimeo account, or upload their entire film through the app server. Native upload is the primary feature; linking is an alternative.

### C. Film discovery + watch

- Cinematic film discovery with preview hook on user interaction/intent, mute by default, visible sound control, clear focus states and reduced-motion behavior. Hover-only interactions must have touch/keyboard equivalents.
- Full player supports native R2 videos with seek/scrub and legal external Vimeo/YouTube embeds. Do not falsely promise identical custom controls across external players.
- Emit meaningful event signals, not every frame or rapid duplicate pings.
- Initial recommendation weights: **light signal** (e.g. watch >=10 s of hook) `alpha ~= 0.08`; **strong signal** (e.g. completed film, like or bookmark) `alpha ~= 0.25`. Tune against real feedback; skip updates on unreliable/duplicate events.

### D. Creative search and collaboration

- Natural-language search across films and **people with multiple roles**, with exact city/role filters and a clear empty/error state.
- Profiles demonstrate work, skills, location, validated credits and contact/collaboration options.
- Allow contextual **one-to-one chat** with film/role cards. Persist messages in Supabase; use Realtime for live updates and ephemeral typing/presence.
- Preserve the potential for crew calls, paid/unpaid opportunities, and music collaborations without inventing a full hiring marketplace until founder confirms the workflow.

---

## 6. Media constraints and reliable uploads

| Asset            | MVP default                                                                                                                | Acceptance requirements                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Profile picture  | Center-cropped **<=256 x 256**, WebP around quality **0.80**; **<=25 KB is a target**, not an excuse for visible artifacts | One profile-picture field; no redundant avatar variants by default; validate dimensions and MIME on the trusted side.                                              |
| Film poster      | **<=800 x 1200**, WebP around quality **0.82**; roughly **100 KB target**                                                  | Maintain intended aspect ratio without stretching; avoid aggressive compression of typography/art.                                                                 |
| Discovery hook   | **Required**, **0 < duration <=30.0 s**, target **720p** and efficiently encoded MP4/H.264 (+audio when authorized)        | Creator chooses the moment; enforce upper bound server-side on metadata AND verify actual asset; mute default in feed.                                             |
| Native main film | One well-optimized **1080p-or-lower H.264/AAC MP4** as simple MVP baseline, seekable (`+faststart` where applicable)       | Prefer original if supported and already good; don't re-encode a visibly poor-quality source expecting improvement. Test browsers/devices and HTTP Range delivery. |
| Storage quota    | **2 GiB initial allowance per account** is the later planning default; actual quotas are founder-configurable              | Enforce safely server-side using verified actual storage usage + reserved pending uploads. Do not trust claimed file size/metadata.                                |

**Smart compression (heuristic, not hardcoded dogma):** for an already-compatible <=1080p MP4 around **<=4.5 Mbps**, prefer pass-through after validation. For oversize/unsupported high-bitrate input, offer client-side conversion toward good-looking 1080p H.264 (starting quality target CRF ~22) **only when the browser/device supports a practical, stable implementation**. Preserve film grain/creative intent; prefer an explicit creator warning or recommended export preset over a frozen tab or a silent quality downgrade. Mobile compression is a distinct implementation.

Large videos must not be buffered wholly in a serverless function or routed through the API. Treat bandwidth, browser memory, failed tabs, CORS, resumability and actual R2 access policy as testable engineering constraints. External `video_url` must never be an arbitrary SSRF fetch target. Purge abandoned uploads and failed upload reservations safely.

**R2 operational requirements:** least-privilege credentials, short-lived signatures, safe path prefixes per asset/user, MIME/size validation, strict allowed-origin CORS (dev + production only), no public write API, sane caching headers and deletion lifecycle. Any CDN/public-domain configuration or pricing change is founder-controlled.

---

## 7. Design system, UX, and accessibility

Claude Code's collaborator owns the authoritative visual artifacts. Accepted design references should be stored or linked from `docs/design/` with version/date, screens, states, tokens, typography, responsive rules, and component specs. **If the assets are not accessible, request them instead of inventing design fidelity.**

- Honor Arcenray's black/white, minimal cinematic aesthetic and restrained frosted rainbow branding; use the actual accepted logo exports, not AI-redrawn replacements.
- Design shared states explicitly: first-use/cold-start, signed-out, loading, upload progress, unsupported codec, R2 or embedding error, empty search, no recommendations, blocked embed, unread chat, no network.
- Build small reusable components from approved tokens; avoid a second component library unless the founder approves.
- Preserve keyboard navigation, focus management, meaningful labels, color contrast, touch targets and reduced-motion accessibility.
- Responsive web + mobile should feel like the same product, not identical layouts. Prioritize correct media playback over decorative motion.
- **Visual review is Claude's sign-off; functional/security review is Codex's sign-off.**

---

## 8. Security, privacy, trust, and cost guardrails

- **The founder holds account control.** Collaborators/agents receive only the minimum necessary permissions (prefer dev/staging projects and published non-secret config). No personal Cloudflare/Supabase account login sharing or service-role keys to frontend developers.
- Secrets belong in managed environment variables/secret stores. Never commit `.env*` containing secrets, Supabase service role keys, R2 secret keys, PATs, signing keys, OAuth client secrets, or production credentials. `.env.example` contains placeholders only.
- Client-exposed Supabase publishable/anon keys are **not** substitutes for correct RLS; ensure `service_role` is server-only. Do not use privileged SDK instances in browser or mobile.
- **No writes to production, deployment, schema push, changing auth providers, domain/DNS change, paid subscription, or creating a public bucket without explicit founder authorization.** Local/staging read/write access stays scoped to the task.
- Never execute destructive CLI commands (`git reset --hard`, force push, dropping tables/buckets, destructive migrations, mass deletions) without explicit instruction and a recovery plan.
- Users can upload copyrighted media, public profiles and messages: implement a minimum viable content-report, takedown, abuse/rate-limit and account-control path before public onboarding. Verify host/embed policy and user rights; do not assume a platform's free tier grants redistribution rights.
- Treat watch histories, location, messages, and creative portfolios as user data. Collect only needed events, document their purpose, and protect private data. No hidden personal profiling, private-message training, or marketing resale.
- Use sensible upload-size, storage, API, embedding and rate limits; monitor current invoices rather than trusting outdated price estimates from old conversations.

---

## 9. Workflow: from task to merged PR

### Intake ticket (every agent)

```text
TASK: <one user-visible outcome>
OWNER: Codex | Claude Code | Antigravity Flash
BRANCH: feat/<short-description> | fix/<short-description>
FILES IN SCOPE: <explicit paths>
DEPENDENCIES: <migrations / API contracts / design files>
ACCEPTANCE: <observable success cases>
TESTS: <commands + manual checks>
DO NOT TOUCH: <paths / resources / cloud actions>
BLOCKERS: <questions requiring founder/Claude approval>
```

### Branch and edit discipline

1. `main` is protected in team practice; make short-lived, purpose-specific branches/worktrees.
2. Codex records or approves a small contract change **before** downstream work begins. After contracts are stable, parallelize independent UI, media, test and mobile tasks.
3. **Codex** changes schema, RLS, Edge Functions and cloud config. **Claude** changes assigned design/UI files against that contract. **Antigravity** changes only the isolated paths in its assigned task. Exception requires explicit founder assignment.
4. Keep migrations and generated types in the **same reviewed sequence**. Do not hand-edit generated DB types as if they were authoritative.
5. PR includes description, screenshots/video for UI when feasible, security implications, test outputs, assumptions and any required env vars; **never include credentials**.
6. Codex reviews/merges each PR; seek Claude's visual review on changed presentation. Do not merge stale branches over unresolved conflicts or silently overwrite collaborator changes.
7. Deploy to **staging** before any production rollout; only founder authorizes and performs production releases, then smoke-tests auth, feed, search, upload and chat.

### Verification expectations

Run scripts that actually exist in the repository; add common scripts in the bootstrap PR if absent:

```bash
pnpm install
pnpm lint
pnpm check-types
pnpm test
pnpm build
```

For Supabase changes, use the official CLI and a **local/staging** instance to validate migrations, RLS and Edge Functions. Never run a blind `supabase db push` against production. For any integration call, test both success and denied/error paths. If you cannot run a command, specify **not run**, the reason, and exactly how the founder can verify.

**Definition of done for an MVP slice:** typed contract; happy path; loading/error/empty states; authorization and negative tests; media and mobile/responsive behavior where applicable; no leaked secrets; relevant lint/types/tests/build; owner-reviewed PR; short handoff explaining follow-up work. Mock APIs are acceptable during isolated UI work **only when visibly documented and not claimed as implemented backend functionality**.

---

## 10. Build sequence and handoffs

**Phase 0 — Bootstrap (Codex leads):** inspect or initialize pnpm/Turborepo; Next.js and Expo scaffolding as appropriate; `packages/shared`; local Supabase setup; staging env; R2 dev bucket/access pattern; branch protection and CI; link design references. **No production provisioning by agents.**

**Phase 1 — Contracts and vertical slice (Codex with Claude design input):** approve core data schema, RLS, profiles/films/credits/chat tables, upload-intent interface, generated types, basic auth and publish states. Claude can create accurate screen/component states in parallel against **typed mocks**, never a competing backend contract.

**Phase 2 — Parallel implementation:**

- **Codex:** secure auth/data integration, native R2 upload/quotas, trusted indexing, search/RPCs, recommender, deployment/staging, cross-platform contracts.
- **Claude Code:** accepted design system, responsive onboarding, film creator, cinematic feed/player, people/film discovery and chat interfaces. Use Codex's API/DTOs; report missing data needs.
- **Antigravity Flash:** only founder-approved easy tasks such as Storybook/demo fixtures (if Storybook is already present), isolated UI polish to supplied specs, integration test scaffolding, static screens with typed mocks, docs, accessibility smoke checks and reproducible bug fixes.

**Phase 3 — Integration and quality (Codex merges):** verify real upload -> R2 -> DB -> indexing -> search/feed -> playback; onboarding -> taste seed; events -> feed update; credit verification -> profile index; two-person chat with RLS; external Vimeo/YouTube links; mobile consumption of shared contracts. Claude approves design consistency; Antigravity may handle narrow bug/QA tickets.

**Phase 4 — Controlled demo/pilot:** founder reviews costs, provider terms, safety/report flows, accessibility, logs/alerts, backups, recovery, and production rollout. Capture feedback without expanding into an unapproved commercial platform.

**Vertical slice order:** login -> onboard -> publish one native film (+hook/poster) -> see it in discovery -> search film/creator -> watch -> message creator -> see one personalization update. Then deepen features and mobile parity. Do not substitute a pretty mock-up for this path.

---

## 11. Communication and escalation

**Ask the founder before:** adding/changing a paid dependency/service, granting OAuth scopes, adding a new platform backend, changing vector model/dimension, modifying a shared schema/RPC, exposing a new public API/data set, changing RLS, deleting user media, introducing payment/ads, modifying DNS/CORS to make assets public, deploying, or merging.

**Ask Claude before:** changing design tokens, logo/typography/brand usage, motion language, user-facing navigation concepts or an approved screen's visual direction.

**Escalate immediately:** discovered secret in history, unauthorized data access, upload abuse/huge costs, user-data leakage, provider ToS incompatibility, insecure RLS, unplayable videos on target devices, or an irreconcilable contract/design conflict.

At task completion, write this handoff:

```text
Implemented:
Changed files:
Contracts/migrations affected:
Checks run (pass/fail/not run):
Screenshots/preview (if applicable):
Risks and remaining issues:
Needs founder approval before merge/deploy:
```

**Do not optimize for maximum autonomous activity. Optimize for correct, reviewable progress under founder control.**
