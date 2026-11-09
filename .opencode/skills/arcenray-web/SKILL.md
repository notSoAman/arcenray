# Arcenray Web Skill

## Stack
- Next.js 16 App Router with React Server Components
- Clerk authentication (via Supabase adapter for RLS)
- Supabase PostgreSQL with RLS
- pnpm monorepo (workspace root)

## Architecture Patterns

### Server/Client Boundaries
- **Server Components** (default): Data fetching, auth checks, RLS-protected queries
- **Client Components** (`"use client"`): Interactivity, browser APIs, real-time subscriptions
- Pass data via props; never expose service role keys to client

### Supabase Client Usage
```typescript
// Server Component - uses RLS via Clerk token
import { createServerClient } from "@/lib/supabase/server";
const supabase = createServerClient();

// Client Component - uses anon key + user session
import { createBrowserClient } from "@/lib/supabase/client";
const supabase = createBrowserClient();
```

### RLS-Protected Queries
All queries respect RLS policies. Key tables:
- `profiles` - user profiles (public read, owner write)
- `films` - film metadata (public read for published, owner write)
- `film_credits` - listed credits (public read, film owner write)
- `conversations`, `messages` - 1:1 chat (participants only)

### File Structure
```
apps/web/
├── app/                    # App Router pages
│   ├── (auth)/            # Auth routes (sign-in, sign-up)
│   ├── (dashboard)/       # Authenticated routes
│   ├── (public)/          # Public routes (feed, profile, film)
│   └── api/               # Route handlers (Edge runtime)
├── components/            # Shared React components
├── lib/
│   ├── supabase/          # Client factories (server.ts, client.ts)
│   ├── clerk/             # Clerk helpers
│   └── utils/             # Shared utilities
└── styles/                # Global CSS, Tailwind config
```

## Key Conventions
- Use `createServerClient()` in Server Components, `createBrowserClient()` in Client Components
- Never bypass RLS; use service role only in Edge Functions with explicit authorization
- Route handlers in `app/api/` use Edge runtime by default
- Shared types in `packages/shared/src/types/`

## Common Tasks
- **Add a page**: Create `app/route/page.tsx` (Server Component by default)
- **Add API endpoint**: Create `app/api/route/route.ts` (Edge runtime)
- **Query with RLS**: Use `createServerClient()` — policies enforce access
- **Real-time**: Use `supabase.channel()` in Client Components with `.subscribe()`

## Documentation
- Full architecture: `/home/aman/Projects/arcenray/AGENTS.md`
- Backend contracts: `/home/aman/Projects/arcenray/docs/architecture/`
- Migration history: `/home/aman/Projects/arcenray/supabase/migrations/`
