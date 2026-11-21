import type { Database } from "@repo/shared";
import type { Api } from "./session";

export type FilmCreator = {
  id: string;
  full_name: string;
  handle: string;
  roles: string[];
  location_city: string | null;
  profile_pic_key: string | null;
};

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
> & { creator?: FilmCreator | null };

export const filmColumns =
  "id,owner_id,title,synopsis,genres,mood_tags,duration_seconds,poster_key,hook_key,film_key,source,provider_id,location_city,language,status,published_at" as const;
export const profileColumns =
  "id,full_name,handle,bio,roles,location_city,skills_gear,profile_pic_key,onboarding_completed" as const;
export const creatorColumns =
  "id,full_name,handle,roles,location_city,profile_pic_key" as const;

/** Attach creator bylines (mirrors the web feed join) for cards and the deck. */
export async function withCreators(api: Api, films: Film[]): Promise<Film[]> {
  const ids = [...new Set(films.map((film) => film.owner_id))];
  if (!ids.length) return films;
  const r = await api.supabase
    .from("profiles")
    .select(creatorColumns)
    .in("id", ids);
  if (r.error) throw r.error;
  const byId = new Map((r.data ?? []).map((p) => [p.id, p]));
  return films.map((film) => ({
    ...film,
    creator: byId.get(film.owner_id) ?? null,
  }));
}

export async function filmPage(
  api: Api,
  offset = 0,
  genre?: string,
): Promise<Film[]> {
  const r = await api.films.feed(20, offset, genre);
  if (r.error) throw r.error;
  const films = (r.data ?? []).filter((x) => x.status === "published");
  return withCreators(api, films);
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

const rolePersonLabels: Record<string, string> = {
  director: "Director",
  actor: "Actor",
  cinematographer: "Cinematographer",
  editor: "Editor",
  writer: "Writer",
  producer: "Producer",
  sound_designer: "Sound designer",
  colorist: "Colourist",
  composer: "Composer",
  musician: "Musician",
  other: "Creative",
};

/** Short person-facing role names (same labels as the web). */
export function personRole(role: string | undefined) {
  if (!role) return null;
  return rolePersonLabels[role] ?? role;
}

/** Display labels for the canonical role taxonomy (web `lib/roles.ts`). */
export const roleLabels: Record<string, string> = {
  director: "Directing",
  actor: "Acting",
  cinematographer: "Cinematography",
  editor: "Editing",
  writer: "Screenwriting",
  producer: "Producing",
  sound_designer: "Sound design",
  colorist: "Colour grading",
  composer: "Composing",
  musician: "Music",
  other: "Something else",
};

/** Ordered as in the onboarding design; canonical values are what get stored. */
export const roleOptions = [
  "director",
  "actor",
  "cinematographer",
  "editor",
  "writer",
  "producer",
  "sound_designer",
  "colorist",
  "composer",
  "musician",
  "other",
] as const;

export function isCreativeRole(value: string) {
  return (roleOptions as readonly string[]).includes(value);
}

/** "Name · Role · City" creator line, matching the web byline. */
export function byline(film: Film, opts: { role?: boolean } = {}) {
  if (!film.creator) return null;
  const parts = [film.creator.full_name || `@${film.creator.handle}`];
  const role = opts.role ? personRole(film.creator.roles[0]) : null;
  if (role) parts.push(role);
  const city = film.location_city ?? film.creator.location_city;
  if (city) parts.push(city);
  return parts.join(" · ");
}
