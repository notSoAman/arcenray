# Arcenray Media Skill

## Architecture

### Storage Layers
- **R2 `arcenray-uploads`** (private): Temporary upload bucket, 24h lifecycle
- **R2 `arcenray-media`** (private): Permanent storage, served via CDN
- **CDN `cdn.arcenray.com`**: Cloudflare-cached delivery with signed URLs

### Upload Flow
1. Client generates presigned upload URL via Edge Function `presign-upload`
2. Client uploads directly to R2 (multipart/resumable for large files)
3. Edge Function `process-upload` validates and moves to permanent bucket
4. Database record created with CDN URL
5. Background job generates poster/hook if needed

### Key Constraints
- **Never buffer entire files server-side** — use streams or multipart
- **Video validation**: ffprobe preflight before processing (Edge Function)
- **Quotas**: 5GB storage per user, 100MB max file size
- **Formats**: MP4 (H.264/AAC), WebP images

## File Structure
```
supabase/functions/
├── presign-upload/        # Generate R2 presigned URLs
├── process-upload/        # Validate and move uploads
└── _shared/
    ├── media-lifecycle.ts # Upload state machine
    └── r2-client.ts       # R2 operations (streaming)

packages/shared/src/media/
├── validation.ts          # Client-side file checks
├── upload.ts              # Resumable upload protocol
└── types.ts               # Media asset types

apps/web/src/lib/media/    # Web-specific media handling
apps/mobile/src/lib/media/ # Mobile-specific media handling
```

## Database Schema
```sql
media_assets (
  id uuid primary key,
  owner_id uuid references profiles(id),
  original_name text,
  mime_type text,
  size_bytes bigint,
  r2_key text unique,        -- R2 object key
  cdn_url text,              -- Cloudflare CDN URL
  processing_state text,     -- pending|processing|ready|failed
  created_at timestamptz
)
```

## Edge Function Patterns

### Presign Upload
```typescript
// supabase/functions/presign-upload/index.ts
import { createR2Client } from "../_shared/r2-client.ts";

Deno.serve(async (req) => {
  const { file_name, mime_type, size } = await req.json();
  
  // Validate quota, file type, size
  const r2 = createR2Client();
  const { upload_url, r2_key } = await r2.createPresignedUpload({
    file_name,
    mime_type,
    size,
    owner_id: user.id
  });
  
  return new Response(JSON.stringify({ upload_url, r2_key }));
});
```

### Process Upload
```typescript
// supabase/functions/process-upload/index.ts
import { validateVideo } from "../_shared/media-lifecycle.ts";

Deno.serve(async (req) => {
  const { r2_key } = await req.json();
  
  // Stream from R2, validate with ffprobe, move to permanent bucket
  const metadata = await validateVideo(r2_key);
  
  // Update database
  await supabase.from("media_assets").update({
    processing_state: "ready",
    cdn_url: `https://cdn.arcenray.com/${r2_key}`
  }).eq("r2_key", r2_key);
});
```

## Client-Side Upload

### Web (Browser)
```typescript
import { resumableUpload } from "@/lib/media/upload";

const result = await resumableUpload({
  file: videoFile,
  onProgress: (percent) => setUploadProgress(percent),
  metadata: { film_id: "..." }
});
```

### Mobile (React Native)
```typescript
import { resumableUpload } from "@/lib/media/upload";

const result = await resumableUpload({
  file: { uri: asset.uri, type: asset.mimeType, size: asset.size },
  onProgress: (percent) => setProgress(percent)
});
```

## Processing States
- `pending`: Upload in progress
- `processing`: Validation/transcoding in progress
- `ready`: Available for playback
- `failed`: Processing error (check `error_message`)

## Common Tasks
- **Add upload endpoint**: Create Edge Function in `supabase/functions/`, use `_shared/r2-client.ts`
- **Add validation rule**: Update `packages/shared/src/media/validation.ts`
- **Change processing logic**: Edit `supabase/functions/_shared/media-lifecycle.ts`
- **Add client upload support**: Implement in `packages/shared/src/media/upload.ts`

## Documentation
- Full architecture: `/home/aman/Projects/arcenray/AGENTS.md`
- Edge Functions: `/home/aman/Projects/arcenray/supabase/functions/`
- Media contracts: `/home/aman/Projects/arcenray/packages/shared/src/media/`
- R2 setup: `/home/aman/Projects/arcenray/docs/architecture/r2-storage.md` (if exists)
