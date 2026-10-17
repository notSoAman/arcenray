import type { Metadata } from "next";
import Link from "next/link";
import { FeaturedFilm } from "../../../components/featured-film";
import { PosterCard } from "../../../components/film-cards";
import { IconSearch } from "../../../components/icons";
import {
  FILM_COLUMNS,
  withCreators,
  loadFeedPage,
  type FeedFilm,
} from "../../../lib/feed";
import { getViewer } from "../../../lib/session";
import { SwipeDeck } from "./swipe-deck";
import styles from "./discover.module.css";

export const metadata: Metadata = { title: "Discover" };
export const dynamic = "force-dynamic";

const GENRES = [
  "Drama",
  "Documentary",
  "Animation",
  "Experimental",
  "Thriller",
  "Comedy",
  "Romance",
  "Horror",
];
const LENGTHS = {
  short: { label: "< 5 min", min: 0, max: 299 },
  mid: { label: "5–10 min", min: 300, max: 600 },
  long: { label: "10 min +", min: 601, max: null },
} as const;
const SORTS = {
  foryou: "For you",
  newest: "Newest",
  shortest: "Shortest",
} as const;

type Params = {
  genre?: string;
  len?: string;
  city?: string;
  sort?: string;
};

function href(current: Params, patch: Partial<Params>) {
  const next = { ...current, ...patch };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/discover?${s}` : "/discover";
}

const escapeLike = (v: string) => v.replace(/[%_\\]/g, "\\$&");

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const raw = await searchParams;
  const params: Params = {
    genre: GENRES.includes(raw.genre ?? "") ? raw.genre : undefined,
    len: raw.len && raw.len in LENGTHS ? raw.len : undefined,
    city: raw.city?.trim().slice(0, 100) || undefined,
    sort:
      raw.sort && raw.sort in SORTS && raw.sort !== "foryou"
        ? raw.sort
        : undefined,
  };
  const { supabase, user } = await getViewer();
  if (!user) return null;

  let films: FeedFilm[] = [];
  let failed = false;
  const personal = !params.sort && !params.len && !params.city;

  if (personal) {
    const page = await loadFeedPage(supabase, 0, params.genre);
    if (page.ok) films = page.films;
    else failed = true;
  } else {
    let query = supabase
      .from("films")
      .select(FILM_COLUMNS)
      .eq("status", "published");
    if (params.genre) query = query.contains("genres", [params.genre]);
    if (params.city)
      query = query.ilike("location_city", escapeLike(params.city));
    if (params.len) {
      const range = LENGTHS[params.len as keyof typeof LENGTHS];
      query = query.gte("duration_seconds", range.min);
      if (range.max !== null) query = query.lte("duration_seconds", range.max);
    }
    const { data, error } = await (
      params.sort === "shortest"
        ? query.order("duration_seconds", {
            ascending: true,
            nullsFirst: false,
          })
        : query.order("published_at", { ascending: false })
    ).limit(48);
    if (error || !data) failed = true;
    else films = await withCreators(supabase, data);
  }

  // City facets from published films (small MVP catalogue).
  const { data: cityRows } = await supabase
    .from("films")
    .select("location_city")
    .eq("status", "published")
    .not("location_city", "is", null)
    .limit(500);
  const cityCounts = new Map<string, number>();
  for (const r of cityRows ?? []) {
    const c = r.location_city?.trim();
    if (c) cityCounts.set(c, (cityCounts.get(c) ?? 0) + 1);
  }
  const cities = [...cityCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([c]) => c);
  if (
    params.city &&
    !cities.some((c) => c.toLowerCase() === params.city!.toLowerCase())
  )
    cities.unshift(params.city);

  const filtered = Boolean(params.genre || params.len || params.city);
  const featured = !filtered && !params.sort ? films[0] : undefined;
  const grid = featured ? films.slice(1) : films;
  const heading = params.genre ?? "All short films";

  return (
    <main className="app-main">
      <div className={styles.titleBlock}>
        <span className="kicker page-kicker">Short films only</span>
        <h1 className="page-title">Discover</h1>
      </div>

      <div className={styles.layout}>
        <aside aria-label="Filters" className={styles.filters}>
          <div className={styles.group}>
            <span className="kicker">Genre</span>
            <div className={styles.genreList}>
              <Link
                href={href(params, { genre: undefined })}
                className={styles.genre}
                aria-current={!params.genre ? "page" : undefined}
              >
                All
              </Link>
              {GENRES.map((g) => (
                <Link
                  key={g}
                  href={href(params, {
                    genre: params.genre === g ? undefined : g,
                  })}
                  className={styles.genre}
                  aria-current={params.genre === g ? "page" : undefined}
                >
                  {g}
                </Link>
              ))}
            </div>
          </div>
          <div className={styles.group}>
            <span className="kicker">Length</span>
            <div className={styles.pills}>
              <Link
                href={href(params, { len: undefined })}
                className="pill"
                aria-current={!params.len ? "page" : undefined}
              >
                Any
              </Link>
              {Object.entries(LENGTHS).map(([key, l]) => (
                <Link
                  key={key}
                  href={href(params, {
                    len: params.len === key ? undefined : key,
                  })}
                  className="pill"
                  aria-current={params.len === key ? "page" : undefined}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
          {cities.length > 0 ? (
            <div className={styles.group}>
              <span className="kicker">City</span>
              <div className={styles.pills}>
                <Link
                  href={href(params, { city: undefined })}
                  className="pill"
                  aria-current={!params.city ? "page" : undefined}
                >
                  Anywhere
                </Link>
                {cities.map((c) => {
                  const on = params.city?.toLowerCase() === c.toLowerCase();
                  return (
                    <Link
                      key={c}
                      href={href(params, { city: on ? undefined : c })}
                      className="pill"
                      aria-current={on ? "page" : undefined}
                    >
                      {c}
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
          <Link href="/search" className={`btn btn-ghost ${styles.advanced}`}>
            <IconSearch size={16} />
            Advanced search
          </Link>
        </aside>

        <div className={styles.results}>
          {featured ? (
            <div className={styles.desktopOnly}>
              <FeaturedFilm film={featured} kicker="Featured short" />
            </div>
          ) : null}

          <section
            className={styles.section}
            aria-labelledby="discover-results"
          >
            <div className={styles.resultsHead}>
              <h2 id="discover-results" className="section-title">
                {heading}{" "}
                <span className={styles.count}>
                  {failed ? "" : films.length}
                </span>
              </h2>
              <div role="group" aria-label="Sort" className={styles.sort}>
                {Object.entries(SORTS).map(([key, label]) => {
                  const on = (params.sort ?? "foryou") === key;
                  return (
                    <Link
                      key={key}
                      href={href(params, {
                        sort: key === "foryou" ? undefined : key,
                      })}
                      className={styles.sortOption}
                      aria-current={on ? "page" : undefined}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>

            {failed ? (
              <div className="state-panel" role="alert">
                <h2>We couldn&apos;t load films.</h2>
                <p>This is usually a brief connection problem.</p>
                <Link href={href(params, {})} className="btn btn-primary">
                  Try again
                </Link>
              </div>
            ) : films.length === 0 ? (
              <div className="state-panel">
                <h2>
                  {filtered
                    ? "No films match these filters yet"
                    : "No short films yet"}
                </h2>
                <p>
                  {filtered
                    ? "Loosen a filter, or try describing what you want in search."
                    : "When filmmakers publish on arcenray, their work appears here."}
                </p>
                {filtered ? (
                  <Link href="/discover" className="btn btn-primary">
                    Clear filters
                  </Link>
                ) : null}
              </div>
            ) : (
              <>
                <div className={styles.deck}>
                  <SwipeDeck films={films} viewerId={user.id} />
                </div>
                <div className={styles.grid}>
                  {grid.map((film) => (
                    <PosterCard key={film.id} film={film} />
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
