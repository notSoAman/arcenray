import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { MetadataRoute } from "next";
import type { Database } from "@repo/shared/database";

const siteUrl = "https://arcenray.com";
const pageSize = 1000;

export const dynamic = "force-dynamic";

type FilmSitemapRow = { id: string; published_at: string | null };
type ProfileSitemapRow = { handle: string; updated_at: string };

async function getPublicFilms(
  client: ReturnType<typeof createClient<Database>>,
): Promise<FilmSitemapRow[]> {
  const rows: FilmSitemapRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("films")
      .select("id,published_at")
      .eq("status", "published")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

async function getPublicProfiles(
  client: ReturnType<typeof createClient<Database>>,
): Promise<ProfileSitemapRow[]> {
  const rows: ProfileSitemapRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("profiles")
      .select("handle,updated_at")
      .eq("onboarding_completed", true)
      .order("updated_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

const getPublicContent = unstable_cache(
  async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return { films: [], profiles: [] };

    // Sitemap reads only the public RLS surface; never use a service-role key here.
    const client = createClient<Database>(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const [films, profiles] = await Promise.all([
      getPublicFilms(client),
      getPublicProfiles(client),
    ]);
    return { films, profiles };
  },
  ["public-sitemap-content-v1"],
  { revalidate: 3600 },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [
    { url: siteUrl, priority: 1 },
    { url: `${siteUrl}/loop`, priority: 0.9 },
    { url: `${siteUrl}/home`, priority: 0.8 },
    { url: `${siteUrl}/privacy`, priority: 0.2 },
    { url: `${siteUrl}/terms`, priority: 0.2 },
  ];
  const { films, profiles } = await getPublicContent();

  return [
    ...pages,
    ...films.map((film) => ({
      url: `${siteUrl}/films/${film.id}`,
      ...(film.published_at ? { lastModified: film.published_at } : {}),
      priority: 0.7,
    })),
    ...profiles.map((profile) => ({
      url: `${siteUrl}/u/${profile.handle}`,
      lastModified: profile.updated_at,
      priority: 0.5,
    })),
  ];
}
