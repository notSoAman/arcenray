import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@repo/shared/database";

export type Supabase = SupabaseClient<Database>;

export const FEED_PAGE = 20;

/** Public film columns the UI reads. Never select search_document or private fields. */
export const FILM_COLUMNS =
  "id,owner_id,title,synopsis,genres,mood_tags,duration_seconds,poster_key,hook_key,film_key,location_city,language,source,provider_id,published_at" as const;

export const FILM_DETAIL_COLUMNS =
  "id,owner_id,title,synopsis,genres,mood_tags,duration_seconds,poster_key,hook_key,film_key,location_city,language,source,provider_id,published_at,status" as const;

export const PROFILE_CARD_COLUMNS =
  "id,full_name,handle,roles,location_city,profile_pic_key" as const;

export type FeedCreator = {
  id: string;
  full_name: string;
  handle: string;
  roles: string[];
  location_city: string | null;
  profile_pic_key: string | null;
};

export type FilmRow = {
  id: string;
  owner_id: string;
  title: string;
  synopsis: string;
  genres: string[];
  mood_tags: string[];
  duration_seconds: number | null;
  poster_key: string | null;
  hook_key: string | null;
  film_key: string | null;
  location_city: string | null;
  language: string | null;
  source: string;
  provider_id: string | null;
  published_at: string | null;
};

export type FeedFilm = FilmRow & { creator: FeedCreator | null };

export type FeedPage =
  | { ok: true; films: FeedFilm[]; hasMore: boolean }
  | { ok: false };

/** Public CDN URL for a published asset key. */
export function mediaUrl(key: string | null | undefined) {
  const base = process.env.NEXT_PUBLIC_MEDIA_URL;
  if (!key || !base) return null;
  return `${base.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;
}

export function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0)
    return null;
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  return `${Math.round(seconds / 60)} min`;
}

export function formatClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function pickFilm(row: FilmRow): FilmRow {
  return {
    id: row.id,
    owner_id: row.owner_id,
    title: row.title,
    synopsis: row.synopsis,
    genres: row.genres,
    mood_tags: row.mood_tags,
    duration_seconds: row.duration_seconds,
    poster_key: row.poster_key,
    hook_key: row.hook_key,
    film_key: row.film_key,
    location_city: row.location_city,
    language: row.language,
    source: row.source,
    provider_id: row.provider_id,
    published_at: row.published_at,
  };
}

/** Public profiles for a set of ids (only completed profiles are readable). */
export async function loadProfiles(supabase: Supabase, ids: string[]) {
  const map = new Map<string, FeedCreator>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return map;
  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_CARD_COLUMNS)
    .in("id", unique);
  for (const p of data ?? []) map.set(p.id, p);
  return map;
}

/** Attach creator bylines. A failed lookup is non-fatal: films render without them. */
export async function withCreators(
  supabase: Supabase,
  rows: FilmRow[],
): Promise<FeedFilm[]> {
  const creators = await loadProfiles(
    supabase,
    rows.map((r) => r.owner_id),
  );
  return rows.map((r) => ({
    ...pickFilm(r),
    creator: creators.get(r.owner_id) ?? null,
  }));
}

/**
 * One page of the personalized feed (RLS-filtered published films, personal
 * ranking with recency fallback) plus the public profiles of their creators.
 */
export async function loadFeedPage(
  supabase: Supabase,
  offset: number,
  genre?: string,
): Promise<FeedPage> {
  const { data, error } = await supabase.rpc("get_personalized_feed", {
    p_limit: FEED_PAGE,
    p_offset: offset,
    p_genre: genre,
  });
  if (error || !data) return { ok: false };
  return {
    ok: true,
    hasMore: data.length === FEED_PAGE,
    films: await withCreators(supabase, data),
  };
}
