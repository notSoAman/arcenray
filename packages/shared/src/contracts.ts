import { z } from "zod";

export const creativeRoles = [
  "director",
  "writer",
  "producer",
  "actor",
  "cinematographer",
  "editor",
  "colorist",
  "composer",
  "musician",
  "sound_designer",
  "other",
] as const;
export const uuidSchema = z.uuid();
const labels = z.array(z.string().trim().min(1).max(80)).max(30);
export const profileInputSchema = z
  .object({
    handle: z.string().regex(/^[a-z0-9_]{3,32}$/),
    full_name: z.string().trim().min(1).max(100),
    bio: z.string().max(2000),
    roles: labels.min(1).max(12),
    onboarding_completed: z.boolean().optional(),
    location_city: z.string().trim().max(100).nullable(),
    skills_gear: labels,
  })
  .strict();
export const filmDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    synopsis: z.string().max(5000),
    genres: labels.max(8),
    mood_tags: labels.max(12),
    location_city: z.string().max(100).nullable(),
    language: z.string().max(80).nullable(),
    source: z.enum(["r2_native", "vimeo_embed", "youtube_embed"]),
    provider_id: z.string().max(100).nullable(),
    film_asset_id: uuidSchema.nullable(),
    hook_asset_id: uuidSchema.nullable(),
    poster_asset_id: uuidSchema.nullable(),
  })
  .strict()
  .superRefine((film, ctx) => {
    if (film.source === "r2_native" && film.provider_id !== null)
      ctx.addIssue({
        code: "custom",
        path: ["provider_id"],
        message: "Native films do not use a provider ID",
      });
    if (
      film.source !== "r2_native" &&
      (!film.provider_id || film.film_asset_id !== null)
    )
      ctx.addIssue({
        code: "custom",
        path: ["provider_id"],
        message:
          "External films require a provider ID and no native film asset",
      });
    if (
      film.source === "youtube_embed" &&
      !/^[A-Za-z0-9_-]{11}$/.test(film.provider_id ?? "")
    )
      ctx.addIssue({
        code: "custom",
        path: ["provider_id"],
        message: "Invalid YouTube video ID",
      });
    if (film.source === "vimeo_embed" && !/^\d+$/.test(film.provider_id ?? ""))
      ctx.addIssue({
        code: "custom",
        path: ["provider_id"],
        message: "Invalid Vimeo video ID",
      });
  });
export const searchSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    kind: z.enum(["all", "film", "profile"]).default("all"),
    city: z.string().max(100).optional(),
    role: z.string().max(80).optional(),
    genre: z.string().max(80).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();
export const uploadSchema = z
  .object({
    kind: z.enum(["film", "hook", "poster", "profile_picture"]),
    bytes: z
      .number()
      .int()
      .positive()
      .max(2 * 1024 ** 3),
    content_type: z.enum(["video/mp4", "image/webp"]),
  })
  .strict()
  .superRefine((upload, ctx) => {
    if (
      (upload.kind === "film" || upload.kind === "hook") !==
      (upload.content_type === "video/mp4")
    )
      ctx.addIssue({
        code: "custom",
        path: ["content_type"],
        message: "Asset kind and MIME type disagree",
      });
  });
export const messageSchema = z
  .object({
    conversation_id: uuidSchema,
    body: z.string().trim().min(1).max(5000),
    client_id: uuidSchema.optional(),
    film_id: uuidSchema.nullable().optional(),
  })
  .strict();
export const eventSchema = z
  .object({
    film_id: uuidSchema,
    kind: z.enum(["hook_watch", "film_complete", "like", "bookmark", "skip"]),
    idempotency_key: uuidSchema,
    watch_seconds: z.number().min(0).max(86400).default(0),
  })
  .strict();
export type ProfileInput = z.infer<typeof profileInputSchema>;
export type FilmDraft = z.infer<typeof filmDraftSchema>;
export type SearchInput = z.input<typeof searchSchema>;
export type UploadInput = z.infer<typeof uploadSchema>;

/** Only local app paths; rejects protocol-relative, escaped slashes and control characters. */
export function safeNextPath(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020\u007f]/.test(value)
  )
    return "/";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decoded))
      return "/";
    const url = new URL(value, "https://arcenray.invalid");
    return url.origin === "https://arcenray.invalid"
      ? url.pathname + url.search + url.hash
      : "/";
  } catch {
    return "/";
  }
}

export const multipartCreateSchema = z.object({
  draft_id: uuidSchema,
  request_id: uuidSchema,
  bytes: z.number().int().positive().max(2147483648),
  content_type: z.literal("video/mp4"),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const multipartSignSchema = z.object({
  asset_id: uuidSchema,
  part_numbers: z.array(z.number().int().min(1).max(128)).min(1).max(2)
    .refine(parts => new Set(parts).size === parts.length, "Duplicate part numbers"),
}).strict();
export type MultipartCreateInput = z.infer<typeof multipartCreateSchema>;
export type MultipartSignInput = z.infer<typeof multipartSignSchema>;
