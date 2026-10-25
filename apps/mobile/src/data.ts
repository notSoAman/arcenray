import type { Database } from "@repo/shared";
import type { Api } from "./session";
export type Film = Pick<
  Database["public"]["Tables"]["films"]["Row"],
  | "id"
  | "owner_id"
  | "title"
  | "synopsis"
  | "genres"
  | "mood_tags"
  | "duration_seconds"
  | "poster_key"
  | "hook_key"
  | "film_key"
  | "source"
  | "provider_id"
  | "location_city"
  | "language"
  | "status"
  | "published_at"
>;
export const filmColumns =
  "id,owner_id,title,synopsis,genres,mood_tags,duration_seconds,poster_key,hook_key,film_key,source,provider_id,location_city,language,status,published_at" as const;
export const profileColumns =
  "id,full_name,handle,bio,roles,location_city,skills_gear,profile_pic_key,onboarding_completed" as const;
export async function filmPage(
  api: Api,
  offset = 0,
  genre?: string,
): Promise<Film[]> {
  const r = await api.films.feed(20, offset, genre);
  if (r.error) throw r.error;
  return (r.data ?? []).filter((x) => x.status === "published");
}
export async function filmDetail(api: Api, id: string) {
  const r = await api.supabase
    .from("films")
    .select(filmColumns)
    .eq("id", id)
    .maybeSingle();
  if (r.error) throw r.error;
  return r.data;
}
export async function toggleFilm(
  api: Api,
  me: string,
  id: string,
  kind: "film_likes" | "film_bookmarks",
  on: boolean,
) {
  const r = on
    ? await api.supabase.from(kind).delete().eq("user_id", me).eq("film_id", id)
    : await api.supabase.from(kind).insert({ user_id: me, film_id: id });
  if (r.error && r.error.code !== "23505") throw r.error;
}
export async function report(
  api: Api,
  me: string,
  target: { film_id?: string; profile_id?: string; message_id?: string },
  reason: string,
) {
  if (reason.trim().length < 3) throw new Error("Describe the issue");
  const r = await api.supabase.from("content_reports").insert({
    reporter_id: me,
    ...target,
    reason: reason.trim().slice(0, 1000),
  });
  if (r.error) throw r.error;
}
export function externalFilmUrl(
  film: Pick<Film, "source" | "provider_id">,
  embed = false,
) {
  const id = film.provider_id ?? "";
  if (film.source === "youtube_embed" && /^[\w-]{11}$/.test(id))
    return embed
      ? `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0`
      : `https://www.youtube.com/watch?v=${id}`;
  if (film.source === "vimeo_embed" && /^\d+$/.test(id))
    return embed
      ? `https://player.vimeo.com/video/${id}?dnt=1`
      : `https://vimeo.com/${id}`;
  return null;
}
export function duration(n: number | null) {
  return n ? `${Math.max(1, Math.round(n / 60))} min` : "";
}
