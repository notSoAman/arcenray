import { createClient } from "@supabase/supabase-js";
import { createArcenrayClient, type Database } from "@repo/shared";

export function createMobileApi(
  backend: { url: string; key: string },
  getToken: () => Promise<string | null> = async () => null,
  fetcher: typeof fetch = fetch,
) {
  return createArcenrayClient(
    createClient<Database>(backend.url, backend.key, {
      accessToken: getToken,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: async (input, init) => {
          const controller = new AbortController();
          const abort = () => controller.abort();
          if (init?.signal?.aborted) controller.abort();
          else init?.signal?.addEventListener("abort", abort, { once: true });
          const timeout = setTimeout(abort, 20000);
          try {
            return await fetcher(input, { ...init, signal: controller.signal });
          } finally {
            clearTimeout(timeout);
            init?.signal?.removeEventListener("abort", abort);
          }
        },
      },
    }),
  );
}

export type FilmCard = Pick<
  Database["public"]["Tables"]["films"]["Row"],
  "id" | "title" | "synopsis" | "genres" | "duration_seconds" | "poster_key"
>;

/** Guest browsing uses a separate anonymous client, even after sign-in. No events. */
export async function loadPublicFilms(api: ReturnType<typeof createMobileApi>) {
  const { data, error } = await api.films.feed(20, 0);
  if (error)
    throw new Error("Could not load films. Check your connection and retry.");
  return (data ?? [])
    .filter((film) => film.status === "published")
    .map((film): FilmCard => ({
      id: film.id,
      title: film.title,
      synopsis: film.synopsis,
      genres: film.genres,
      duration_seconds: film.duration_seconds,
      poster_key: film.poster_key,
    }));
}
