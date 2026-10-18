# Arcenray stack guide for a Django developer

Start with JavaScript, React and the server/browser boundary. You already know HTTP,
SQL, validation and authentication concepts; the main change is where those responsibilities run.
Resources below were checked against official documentation on 2026-10-17.

## Learn in this order

| Topic                   | Official resource                                                                                                                                               | Focus and small exercise                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JavaScript              | [MDN JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide)                                                                           | Modules, objects/arrays, destructuring, promises, `async`/`await`, exceptions and `fetch`. Translate a small Python API call into JavaScript and handle an error.       |
| TypeScript              | [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)                                                                                  | Object types, unions, narrowing, optional values and generics. Read a shared DTO and explain each nullable field. Types disappear at runtime; validation still matters. |
| React                   | [React Learn](https://react.dev/learn)                                                                                                                          | Components, props, state, events and effects. Build a tiny filterable film list separately from this repository.                                                        |
| Next.js App Router      | [Next.js dashboard course](https://nextjs.org/learn/dashboard-app)                                                                                              | Routes/layouts, server components, loading/error states, data access and rendering. Follow its framework lessons; keep this project's Clerk authentication.             |
| Supabase/PostgreSQL     | [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)                                                                     | SQL grants, ownership policies and unauthenticated denial. Read one policy and identify what Alice, Bob and a guest can do.                                             |
| Clerk                   | [Next.js quickstart](https://clerk.com/docs/nextjs/getting-started/quickstart), [Supabase integration](https://supabase.com/docs/guides/auth/third-party/clerk) | Session tokens, server versus browser helpers and trusted JWT issuers. Trace sign-in to our stable profile UUID.                                                        |
| Cloudflare R2           | [R2 documentation](https://developers.cloudflare.com/r2/)                                                                                                       | Object keys, private/public delivery, presigned uploads and CORS. Explain why video bytes bypass the web server.                                                        |
| Workspace tooling, last | [pnpm workspaces](https://pnpm.io/workspaces), [Turborepo](https://turborepo.dev/docs)                                                                          | Package dependencies and running checks across workspaces. Understand the root scripts before changing tooling.                                                         |

Work through these in short sessions while tracing this application. You do not need
to master every service before making a small UI fix. Expo can wait until native mobile
work starts; it is not required to understand or run the website.

## Translate familiar Django concepts

| Django concept                            | What to read here                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `urls.py`, views and templates            | `apps/web/app`: route folders, `page.tsx`, `layout.tsx` and React components. Server components can read data before rendering.                   |
| Browser JavaScript attached to a template | Client components marked `"use client"`: interactive React UI, state and browser APIs.                                                            |
| `models.py`, ORM queries and migrations   | PostgreSQL tables/functions/RLS in `supabase/migrations`; Supabase JS queries and SQL RPCs. No Django-style ORM generates this schema.            |
| Forms/serializer validation               | Shared Zod contracts in `packages/shared/src/contracts.ts`, plus trusted SQL/Edge validation. TypeScript alone cannot validate incoming requests. |
| `request.user` and permission checks      | Clerk verifies identity; our token adapter and `current_profile_id()` resolve a UUID; database RLS checks access on every exposed operation.      |
| A narrow trusted API view                 | Supabase Edge Function, such as `supabase/functions/media-upload/index.ts`.                                                                       |
| Uploaded media storage                    | R2 object storage; database rows reference assets and ownership.                                                                                  |
| Python virtualenv/package tooling         | Node runtime plus pnpm dependencies/lockfile. Turborepo coordinates workspace tasks.                                                              |

This is not a single Django process with all requests passing through your views.
Some browser requests go directly to Supabase. Hiding a button or protecting a Next.js
page does not protect those APIs: grants, RLS and trusted handlers must enforce access.

## Follow one real feature: publish a film

1. `apps/web/app/(app)/publish/page.tsx` reads the viewer on the server and redirects
   signed-out users. `publish-form.tsx` handles the interactive editor in the browser.
2. `apps/web/lib/client-api.ts` provides `browserApi()`. Its shared SDK implementation
   is `packages/shared/src/client.ts`; the browser Supabase adapter attaches a Clerk token.
3. Draft metadata uses SDK film operations with database RLS. File transfer uses
   `apps/web/lib/media/upload.ts`: validate, reserve, upload, verify and report progress.
4. SDK `media.create()` invokes `media-upload` with `action: "create"`. Its shared
   HTTP helper authenticates through Supabase's verified token and identity RPC before
   privileged work. SQL reserves quota; the response contains a short-lived upload URL.
5. The browser uploads bytes directly to private R2 storage. SDK `media.complete()`
   asks the trusted function to inspect the actual object. Client-supplied metadata
   alone cannot make an asset ready.
6. SDK `films.publish()` invokes the same function's publication action. Trusted
   checks and SQL determine whether the film can become public; R2 delivery exposes
   approved assets. `index-entity` computes the server-side search embedding.

Read `supabase/functions/_shared/r2.ts`, the relevant migrations and
[the verified journey](architecture/loop-creator-journey.md) alongside this trace.
Do not run live cloud writes merely to follow the code.

## Three habits that prevent expensive mistakes

- Server components run on the server; client component code and `NEXT_PUBLIC_*`
  variables can reach the browser. Keep Clerk secret keys, R2 keys and Supabase
  service-role credentials out of client bundles and Git.
- SQL migrations are the schema source of truth. Generated database TypeScript
  describes that schema; hand-editing types does not change the database.
- Run `pnpm test`, `pnpm lint`, `pnpm check-types` and `pnpm build`. Live backend
  smoke tests create cloud fixtures and need a deliberately selected development
  environment. Passing local checks does not prove production credentials or recovery.
