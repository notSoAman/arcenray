import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@repo/shared/database";

export const FEED_PAGE = 20;

export type FeedCreator = {
  id: string;
  full_name: string;
  handle: string;
  roles: string[];
  location_city: string | null;
};

export type FeedFilm = {
  id: string;
  title: string;
  synopsis: string;
  genres: string[];
  duration_seconds: number | null;
  poster_key: string | null;
  location_city: string | null;
  source: string;
  creator: FeedCreator | null;
};

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

/**
 * One page of the personalized feed (RLS-filtered published films, personal
 * ranking with recency fallback) plus the public profiles of their creators.
 * A failed creator lookup is non-fatal: films still render without bylines.
 */
export async function loadFeedPage(
  supabase: SupabaseClient<Database>,
  offset: number,
): Promise<FeedPage> {
  const { data, error } = await supabase.rpc("get_personalized_feed", {
    p_limit: FEED_PAGE,
    p_offset: offset,
  });
  if (error || !data) return { ok: false };

  const ownerIds = [...new Set(data.map((f) => f.owner_id))];
  const creators = new Map<string, FeedCreator>();
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,full_name,handle,roles,location_city")
      .in("id", ownerIds);
    for (const p of profiles ?? []) creators.set(p.id, p);
  }

  return {
    ok: true,
    hasMore: data.length === FEED_PAGE,
    films: data.map((f) => ({
      id: f.id,
      title: f.title,
      synopsis: f.synopsis,
      genres: f.genres,
      duration_seconds: f.duration_seconds,
      poster_key: f.poster_key,
      location_city: f.location_city,
      source: f.source,
      creator: creators.get(f.owner_id) ?? null,
    })),
  };
}
