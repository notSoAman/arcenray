# Arcenray in 7 days: a hands-on path for a Django developer

This is a one-week orientation for a Django developer who wants to understand,
review, and make small Arcenray changes without relying on Codex to write every
line. It is not a promise to master six ecosystems in a week. The goal is to be
able to trace one feature, edit a small UI or shared-contract-adjacent change,
spot risky boundaries, and explain what needs review.

**Pace:** 60–90 minutes each day. Read only the linked sections, then spend at
least half the session in this repository. Keep a short learning log: what you
changed, what surprised you, and what you would ask before changing further.

## Before day 1

Use the existing development setup and current feature branch. This checkout
already has unrelated uncommitted UI work; don't reset, stage, or edit those
files. Begin by inspecting your working tree and the project scripts:

```bash
git status --short --branch
cat package.json
cat pnpm-workspace.yaml
```

If you need a personal exercise branch, first preserve the existing edits using
your normal Git workflow or ask Codex to make a clean worktree. Do not run cloud
smokes, deploy, change environment variables, or make shared database/auth
changes as a learning exercise.

## The seven-day route

| Day | Learn | Make something small | You are done when… |
| --- | --- | --- | --- |
| 1 | JavaScript, TypeScript, pnpm and the monorepo | Read and annotate a shared DTO | You can explain a TypeScript type, a Zod runtime check, and how a workspace imports shared code |
| 2 | React components, state and events | Trace and adjust a small existing interaction | You can predict which state change causes which UI update |
| 3 | Next.js App Router and server/client boundaries | Trace one route from page to interactive component | You can tell which code runs on the server and which runs in the browser |
| 4 | Clerk identity, Supabase access and authorization | Draw the sign-in-to-database identity path | You can distinguish identity, app profile ID, and database permission checks |
| 5 | Cloudflare R2 and media flow | Trace one upload without executing it | You can explain why bytes go to R2 directly and where trusted checks happen |
| 6 | Expo and React Native | Trace a mobile screen and compare it to web | You can identify what can be shared and what must be native |
| 7 | Make, inspect and explain a small change | Implement a reversible UI improvement and review the diff | You can describe the change, its boundary, and the checks you ran |

## Day 1 — JavaScript, TypeScript and the workspace

**Read:** [JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide),
[TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/),
[pnpm workspaces](https://pnpm.io/workspaces), and the root
`package.json` / `pnpm-workspace.yaml`.

Focus on imports/exports, arrays and objects, destructuring, promises,
`async`/`await`, exceptions, union types, optional values, and narrowing. The
biggest Django-to-TypeScript adjustment: a TypeScript type is removed before
runtime. It does not validate a browser request. Arcenray uses Zod for runtime
validation at important boundaries.

**Repo exercise:** open `packages/shared/src/contracts.ts` and find one upload
or film input schema. Write down (in your learning log):

- its TypeScript input and output shapes;
- which values are optional or nullable;
- what invalid input the Zod schema rejects;
- one place that calls the schema.

Then trace how `apps/web` imports `@repo/shared`, and inspect the matching
package scripts. Don't edit generated `database.types.ts`; it describes the
database contract and is generated from it.

**Django translation:** Python package + virtualenv → workspace package + Node
dependencies; serializer/schema → Zod at runtime plus TypeScript types while
editing; `manage.py` command → a package script or root `pnpm` script.

## Day 2 — React: UI as components and state

**Read:** [React Learn](https://react.dev/learn), especially *Describing the UI*,
*Adding Interactivity*, and *Managing State*.

Think of a component as a function that describes the UI for current props and
state. State changes trigger a render; you generally describe the new UI rather
than manually patching the DOM. Event handlers run because a person acts. Effects
are for synchronizing with something outside React, not as a default place for
all application logic.

**Repo exercise:** pick a small interaction in an existing web component (for
example a menu, filter, or form state). Read it before editing. Sketch the
sequence `event → state update → render`, then make one tiny, visible,
reversible improvement in your isolated working copy. Keep the change within
the existing design and component conventions. Inspect the diff and undo your
exercise edit after you have explained it, unless you want to keep it for review.

**Django translation:** a React component is not a Django template rendered
once. It may rerender as local state or props change. A client component can
also handle browser-only interactions, while the route may have server-rendered
parts (Day 3).

## Day 3 — Next.js App Router and the server/browser line

**Read:** [Next.js App Router Learn course](https://nextjs.org/learn) sections
on routing, layouts, navigation, data fetching, and rendering. In the repo,
compare a `page.tsx`, a nearby interactive component, and `apps/web/app/layout.tsx`.

Next.js gives React conventions for routes and server rendering. A route folder
is part of the URL; `page.tsx` renders that route, and `layout.tsx` wraps a
route subtree. Server Components can access server-only code and render before
the browser receives the page. A file marked `"use client"` is a client entry
point for browser interaction. Anything imported into a client component must
be safe to ship to the browser.

**Repo exercise:** trace a read-only page such as
`apps/web/app/(app)/u/[handle]/page.tsx` and identify where it gets data. Then
trace one button or form into its client component. Mark each step as server,
browser, or database/service. Do not move code across that boundary during this
exercise.

**Django translation:** route folder + `page.tsx` is closest to URL/view/template
combined, but server and client rendering are explicit parts of the same React
tree. Middleware/layout protection is useful for navigation, but it is not a
substitute for authorization at the data/API boundary.

## Day 4 — Clerk identity and Supabase authorization

**Read:** `docs/architecture/clerk-auth.md`, then the relevant identity helper
in `packages/shared/src/client.ts` and one RLS policy in
`supabase/migrations/`. Official references:
[Clerk Next.js](https://clerk.com/docs/nextjs/getting-started/quickstart) and
[Supabase third-party auth with Clerk](https://supabase.com/docs/guides/auth/third-party/clerk).

Keep these questions separate:

1. **Authentication:** has Clerk verified this person and issued a session token?
2. **Application identity:** how does Arcenray map that trusted issuer/subject
   to its stable profile UUID?
3. **Authorization:** may this identity read or write this row? RLS and trusted
   server operations enforce that decision.

**Repo exercise:** draw the path from sign-in to a database query. Label where
the Clerk token is obtained, where it is attached, where the app UUID is
resolved, and where the database checks access. Read a policy and explain what
it allows for the owner, another signed-in user, and a guest. This is a reading
exercise only: don't alter auth configuration, policies, migrations, or live
accounts.

**Django translation:** Clerk is the identity provider, not your `User` model;
the stable Arcenray profile UUID is the app's user identity. RLS is a database
permission layer, not merely a view decorator. A hidden button or protected
page does not make a direct API request safe.

## Day 5 — Cloudflare R2 and the media path

**Read:** [Cloudflare R2 documentation](https://developers.cloudflare.com/r2/),
`docs/architecture/r2-ffmpeg-processing.md`, and the existing learning guide's
“Follow one real feature” trace below (the film upload path). Inspect
`supabase/functions/media-upload/index.ts` and the web upload helper, but don't
invoke cloud operations.

At a high level, the app asks a trusted backend for an authorized upload
operation; the browser sends file bytes directly to object storage; the
backend verifies the stored object and controls the state transition. The
database stores ownership and asset metadata. A signed URL is a short-lived
capability, so treat it like a credential and never log or persist it casually.

**Repo exercise:** make a sequence diagram in your learning log:
`browser → trusted function → reservation/signature → R2 → completion check →
processing/publication`. At each step write down who is trusted to decide what.
Explain why putting a multi-gigabyte file through a serverless API would be a
bad fit. Don't upload, publish, change CORS/buckets/secrets, or run backend
smokes.

**Django translation:** R2 is object storage, not the database or Django media
directory. The Edge Function is a narrow trusted operation, not a general
Django-style API server. Supabase/Postgres remains the relational source of
truth.

## Day 6 — Expo and React Native

**Read:** `docs/architecture/mobile-parity.md`, `apps/mobile/README.md`, and
Expo's [Router introduction](https://docs.expo.dev/router/introduction/) and
[React Native environment setup](https://reactnative.dev/docs/environment-setup).

Expo is the toolchain around a React Native app. React Native renders native
views; it is not the web app inside a phone shell. Expo Router maps files to
screens and navigation. Web and mobile can share `packages/shared` contracts,
validation, and business logic, but not DOM elements, CSS modules, Next.js
server components/cookies, or browser-only file/media APIs.

**Repo exercise:** find the mobile route/screen that corresponds to guest film
browsing. Trace its loading, error, empty, and success states; find where it
calls shared code. Compare with the web route and list three shared pieces and
three platform-specific pieces. Run the existing mobile app locally only if
your normal dev environment is ready; don't install native tooling solely to
finish this week.

**Django translation:** React component concepts carry over, but React Native
uses native primitives and platform APIs rather than HTML. Expo provides
navigation, builds, and native module integrations; it does not make a web
component automatically portable.

## Day 7 — Your first independent change

Choose one small, presentation-only improvement in an unmodified file in your
own clean working copy: clearer helper text, a more useful empty state, or a
small interaction detail. Avoid auth, schema, RLS, shared API contracts,
uploads, provider settings, and cloud configuration. Don't edit the unrelated
uncommitted files in this checkout.

Use this loop:

1. State the user-visible behavior you want to change in one sentence.
2. Find the route, component, props/state, and existing design convention.
3. Change one thing; keep it easy to revert.
4. Read the whole diff and check `git status --short` to ensure you touched only
   your intended file. Don't stage someone else's existing changes.
5. Run `pnpm check-types` if the change is TypeScript/TSX, then start the
   relevant local app and inspect the actual state you changed. Do not claim
   browser, auth, cloud, or mobile verification you did not perform.
6. Explain the component boundary, any data/security boundary nearby, what you
   checked, and one thing you deliberately left untouched.

The goal is a sound small change and a clear explanation, not volume. Ask Codex
to review the diff if you want feedback; keep ownership of the reasoning and
make the follow-up edit yourself.

## Reference map: Django concepts to this repository

| Django concept | Arcenray equivalent |
| --- | --- |
| `urls.py`, views and templates | `apps/web/app`: route folders, `page.tsx`, `layout.tsx`, and React components |
| Browser JavaScript in a template | Client components marked `"use client"` |
| `models.py`, ORM queries and migrations | PostgreSQL schema/functions/RLS in `supabase/migrations`; Supabase JS or SQL RPC for queries |
| Serializer/form validation | Shared Zod contracts in `packages/shared/src/contracts.ts`, plus trusted SQL/Edge validation |
| `request.user` | Clerk-verified identity mapped to a stable Arcenray profile UUID |
| View permission checks | RLS and explicit authorization in trusted operations; UI checks are only UX |
| Narrow trusted API view | Supabase Edge Function, such as `supabase/functions/media-upload/index.ts` |
| Django media files | Cloudflare R2 objects referenced by durable asset metadata |
| `requirements.txt` + virtualenv | workspace `package.json` manifests, pnpm lockfile, Node runtime |
| Django app/module | pnpm workspace package, coordinated by Turborepo |

## Follow one real feature: publish a film

Use this after Day 3 or Day 5 to see the pieces together:

1. `apps/web/app/(app)/publish/page.tsx` checks the viewer on the server and
   redirects signed-out users; `publish-form.tsx` handles the interactive form.
2. `apps/web/lib/client-api.ts` provides `browserApi()`; the shared SDK is in
   `packages/shared/src/client.ts` and the browser adapter attaches a Clerk token.
3. Draft metadata uses SDK film operations. File transfer uses the web media
   helper to validate, reserve, upload, verify, and report progress.
4. `media.create()` calls `media-upload` with `action: "create"`. Trusted code
   authenticates and authorizes the operation; SQL reserves usage and the
   response carries short-lived upload details.
5. The browser uploads bytes directly to private R2. `media.complete()` asks a
   trusted function to inspect the actual stored object; client metadata alone
   cannot declare it ready.
6. Publication goes through server-side eligibility checks and database state
   transitions. Search indexing is handled separately by `index-entity`.

Read `supabase/functions/_shared/r2.ts` and
`docs/architecture/loop-creator-journey.md` beside this trace. This is a code
reading exercise; don't run live cloud writes just to follow it.

## Three habits to keep after the week

- Before editing, find the owner of the decision: component, shared contract,
  schema, identity, storage, or deployment.
- Treat browser input as untrusted even when TypeScript says it has the right
  shape. Runtime validation and server/database authorization still matter.
- Keep a small diff and verify the exact layer you changed. Local type checks
  do not prove real Clerk login, RLS behavior, R2 uploads, or mobile device flows.

## Official references

- [MDN JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/)
- [React Learn](https://react.dev/learn)
- [Next.js Learn](https://nextjs.org/learn)
- [pnpm workspaces](https://pnpm.io/workspaces)
- [Clerk + Next.js quickstart](https://clerk.com/docs/nextjs/getting-started/quickstart)
- [Supabase Clerk integration](https://supabase.com/docs/guides/auth/third-party/clerk)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [React Native setup](https://reactnative.dev/docs/environment-setup)
