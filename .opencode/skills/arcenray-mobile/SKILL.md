# Arcenray Mobile Skill

## Stack
- Expo Router (file-based routing)
- React Native 0.88
- Clerk authentication (via `@clerk/expo`)
- Supabase (direct client, resumable uploads)
- Shared contracts from `packages/shared`

## Architecture Patterns

### Authentication Flow
```typescript
import { useAuth } from "@clerk/expo";
import { createMobileClient } from "@/lib/supabase";

// Clerk provides the token, Supabase client uses it for RLS
const { getToken } = useAuth();
const supabase = createMobileClient(getToken);
```

### Resumable Uploads
Mobile uses direct resumable uploads to R2 (bypassing Edge Functions):
```typescript
import { resumableUpload } from "@/lib/media/upload";

await resumableUpload({
  file: asset,
  onProgress: (pct) => setProgress(pct),
  metadata: { film_id, asset_type }
});
```

### Shared Contracts
Import types and validation from workspace:
```typescript
import type { Film, Profile } from "@repo/shared/types";
import { validateFilm } from "@repo/shared/validation";
```

## File Structure
```
apps/mobile/
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Tab navigation
│   ├── film/              # Film routes
│   ├── profile/           # Profile routes
│   └── _layout.tsx        # Root layout
├── components/            # Reusable components
├── lib/
│   ├── supabase/          # Mobile Supabase client
│   ├── clerk/             # Clerk token provider
│   └── media/             # Upload, compression, playback
└── hooks/                 # Custom React hooks
```

## Android-Specific Rules
- **Permissions**: Camera, microphone, media library — request at runtime
- **Video playback**: Use `expo-video` with `useVideoPlayer` hook
- **File paths**: Use `FileSystem.documentDirectory` for persistent storage
- **Large uploads**: Chunk with resumable protocol; handle background/foreground transitions

## Key Conventions
- Expo Router uses file-based routing — filename determines route
- Use `useLocalSearchParams()` for dynamic route params
- Client Components only (no Server Components in React Native)
- Shared validation runs on-device before upload

## Common Tasks
- **Add screen**: Create `app/route.tsx` with default export
- **Add tab**: Add to `app/(tabs)/_layout.tsx`
- **Query data**: Use Supabase client with RLS (same as web)
- **Upload**: Use `resumableUpload()` from `lib/media/upload.ts`
- **Playback**: Use `useVideoPlayer()` from `expo-video`

## Documentation
- Full architecture: `/home/aman/Projects/arcenray/AGENTS.md`
- Shared types: `/home/aman/Projects/arcenray/packages/shared/src/types/`
- Media contracts: `/home/aman/Projects/arcenray/packages/shared/src/media/`
