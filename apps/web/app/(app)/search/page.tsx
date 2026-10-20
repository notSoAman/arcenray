import { createArcenrayClient } from "@repo/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { RowCard } from "../../../components/film-cards";
import { IconSearch } from "../../../components/icons";
import { Avatar } from "../../../components/media";
import {
  FILM_COLUMNS,
  loadProfiles,
  withCreators,
  type FeedCreator,
  type FeedFilm,
} from "../../../lib/feed";
import {
  personRole,
  roleLabels,
  roleOptions,
  isCreativeRole,
} from "../../../lib/roles";
import { getViewer } from "../../../lib/session";
import { LocationInput } from "../../../components/location-input";
import styles from "./search.module.css";

export const metadata: Metadata = { title: "Search" };
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
const PROMPTS = [
  "quiet night-time dramas",
  "editors who cut documentaries",
  "films shot in Mumbai",
  "composers for a short film",
];
const KINDS = { all: "All", film: "Films", profile: "People" } as const;

type Params = {
  q?: string;
  kind?: string;
  city?: string;
  role?: string;
  genre?: string;
};

function href(current: Params, patch: Partial<Params>) {
  const next = { ...current, ...patch };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/search?${s}` : "/search";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const raw = await searchParams;
  const params: Params = {
    q: raw.q?.trim().slice(0, 500) || undefined,
    kind: raw.kind === "film" || raw.kind === "profile" ? raw.kind : undefined,
    city: raw.city?.trim().slice(0, 100) || undefined,
    role: raw.role && isCreativeRole(raw.role) ? raw.role : undefined,
    genre: GENRES.includes(raw.genre ?? "") ? raw.genre : undefined,
  };
  // Exact filters are scoped: roles only apply to people, genres only to films.
  const kind = params.role
    ? "profile"
    : params.genre
      ? "film"
      : (params.kind ?? "all");

  const { supabase } = await getViewer();
  let films: FeedFilm[] = [];
  let people: FeedCreator[] = [];
  let mode: string | null = null;
  let failed = false;

  if (params.q) {
    const { data, error } = await createArcenrayClient(supabase).search({
      query: params.q,
      kind: kind as "all" | "film" | "profile",
      ...(params.city ? { city: params.city } : {}),
      ...(params.role ? { role: params.role } : {}),
      ...(params.genre ? { genre: params.genre } : {}),
      limit: 30,
    });
    if (error || !data) {
      failed = true;
    } else {
      mode = data.mode;
      const filmIds = data.results
        .filter((r) => r.kind === "film")
        .map((r) => r.id);
      const personIds = data.results
        .filter((r) => r.kind === "profile")
        .map((r) => r.id);
      const [filmRows, profileMap] = await Promise.all([
        filmIds.length
          ? supabase
              .from("films")
              .select(FILM_COLUMNS)
              .eq("status", "published")
              .in("id", filmIds)
          : Promise.resolve({ data: [] as never[] }),
        loadProfiles(supabase, personIds),
      ]);
      const hydrated = await withCreators(supabase, filmRows.data ?? []);
      const byId = new Map(hydrated.map((f) => [f.id, f]));
      films = filmIds
        .map((id) => byId.get(id))
        .filter((f): f is FeedFilm => Boolean(f));
      people = personIds
        .map((id) => profileMap.get(id))
        .filter((p): p is FeedCreator => Boolean(p));
    }
  }

  const total = films.length + people.length;
  const filtersOn = Boolean(params.city || params.role || params.genre);

  return (
    <main className="app-main">
      <section className={styles.top}>
        <h1 className="page-title">Search</h1>
        <form
          action="/search"
          method="get"
          role="search"
          className={styles.bar}
        >
          <IconSearch size={22} />
          <label htmlFor="search-q" className="visually-hidden">
            Search films and people
          </label>
          <input
            id="search-q"
            name="q"
            type="search"
            defaultValue={params.q ?? ""}
            placeholder="Describe a mood, a place or a kind of person"
            autoComplete="off"
            maxLength={500}
            className={styles.input}
          />
          {params.kind ? (
            <input type="hidden" name="kind" value={params.kind} />
          ) : null}
          {params.city ? (
            <input type="hidden" name="city" value={params.city} />
          ) : null}
          {params.role ? (
            <input type="hidden" name="role" value={params.role} />
          ) : null}
          {params.genre ? (
            <input type="hidden" name="genre" value={params.genre} />
          ) : null}
          <button type="submit" className={`btn btn-accent ${styles.submit}`}>
            Search
          </button>
        </form>
        <div className={styles.prompts}>
          <span className={`kicker ${styles.try}`}>Try</span>
          {PROMPTS.map((p) => (
            <Link
              key={p}
              href={href(params, { q: p })}
              className={styles.prompt}
            >
              “{p}”
            </Link>
          ))}
        </div>
      </section>

      <div className={styles.layout}>
        <aside aria-label="Advanced search" className={styles.advanced}>
          <div className={styles.advHead}>
            <h2>Advanced</h2>
            {filtersOn ? (
              <Link
                href={href(params, {
                  city: undefined,
                  role: undefined,
                  genre: undefined,
                })}
                className={styles.reset}
              >
                Reset
              </Link>
            ) : null}
          </div>
          <form action="/search" method="get" className={styles.group}>
            <label htmlFor="search-city" className="kicker">
              Location
            </label>
            <div className={styles.cityRow}>
              <LocationInput
                key={params.city ?? ""}
                id="search-city"
                name="city"
                defaultValue={params.city ?? ""}
                placeholder="Exact city, e.g. Kochi"
                className={styles.small}
                maxLength={100}
              />
              {params.q ? (
                <input type="hidden" name="q" value={params.q} />
              ) : null}
              {params.kind ? (
                <input type="hidden" name="kind" value={params.kind} />
              ) : null}
              {params.role ? (
                <input type="hidden" name="role" value={params.role} />
              ) : null}
              {params.genre ? (
                <input type="hidden" name="genre" value={params.genre} />
              ) : null}
              <button type="submit" className="pill">
                Apply
              </button>
            </div>
          </form>
          <div className={styles.group}>
            <span className="kicker">People · role</span>
            <div className={styles.pills}>
              {roleOptions.map((r) => (
                <Link
                  key={r}
                  href={href(params, {
                    role: params.role === r ? undefined : r,
                    genre: undefined,
                  })}
                  className="pill"
                  aria-current={params.role === r ? "page" : undefined}
                >
                  {roleLabels[r]}
                </Link>
              ))}
            </div>
          </div>
          <div className={styles.group}>
            <span className="kicker">Films · genre</span>
            <div className={styles.pills}>
              {GENRES.map((g) => (
                <Link
                  key={g}
                  href={href(params, {
                    genre: params.genre === g ? undefined : g,
                    role: undefined,
                  })}
                  className="pill"
                  aria-current={params.genre === g ? "page" : undefined}
                >
                  {g}
                </Link>
              ))}
            </div>
          </div>
        </aside>

        <div className={styles.results}>
          <div role="tablist" aria-label="Search in" className={styles.scopes}>
            {Object.entries(KINDS).map(([key, label]) => {
              const on = kind === key;
              const disabled =
                (params.role && key !== "profile") ||
                (params.genre && key !== "film");
              return disabled ? (
                <span key={key} className={styles.scope} aria-disabled="true">
                  {label}
                </span>
              ) : (
                <Link
                  key={key}
                  role="tab"
                  aria-selected={on}
                  href={href(params, { kind: key === "all" ? undefined : key })}
                  className={styles.scope}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          {!params.q ? (
            <div className={styles.intro}>
              <h2>Search by feeling, not just by name.</h2>
              <p>
                Describe what you&apos;re looking for — a mood, a place, a craft
                — and arcenray matches films and people by meaning and by words.
                Use the advanced filters for an exact city, role or genre.
              </p>
            </div>
          ) : failed ? (
            <div className="state-panel" role="alert">
              <h2>Search isn&apos;t responding.</h2>
              <p>
                Wait a moment and try again. If you search a lot very quickly,
                there&apos;s a short cool-down.
              </p>
              <Link href={href(params, {})} className="btn btn-primary">
                Try again
              </Link>
            </div>
          ) : total === 0 ? (
            <div className="state-panel">
              <h2>Nothing matched that yet</h2>
              <p>
                Try describing a mood, a place or a kind of person, or loosen
                the advanced filters.
              </p>
              <Link href="/search" className="btn btn-primary">
                Clear search and filters
              </Link>
            </div>
          ) : (
            <>
              <div className={styles.summary}>
                <span>
                  {total} result{total === 1 ? "" : "s"} for “{params.q}”
                  {params.city ? ` in ${params.city}` : ""}
                </span>
                <span className="kicker">
                  {mode === "hybrid" ? "Meaning + words" : "Words only"}
                </span>
              </div>
              {films.length > 0 ? (
                <section
                  className={styles.group}
                  aria-labelledby="film-results"
                >
                  <h2 id="film-results" className={styles.groupTitle}>
                    Films
                  </h2>
                  <div className={styles.filmGrid}>
                    {films.map((f) => (
                      <RowCard key={f.id} film={f} />
                    ))}
                  </div>
                </section>
              ) : null}
              {people.length > 0 ? (
                <section
                  className={styles.group}
                  aria-labelledby="people-results"
                >
                  <h2 id="people-results" className={styles.groupTitle}>
                    People
                  </h2>
                  <div className={styles.peopleGrid}>
                    {people.map((p) => (
                      <Link
                        key={p.id}
                        href={`/u/${p.handle}`}
                        className={styles.person}
                      >
                        <Avatar
                          picKey={p.profile_pic_key}
                          name={p.full_name}
                          size={52}
                        />
                        <span className={styles.personText}>
                          <span className={styles.personName}>
                            {p.full_name}
                          </span>
                          <span className={styles.personMeta}>
                            {[
                              p.roles
                                .map(personRole)
                                .filter(Boolean)
                                .slice(0, 2)
                                .join(", "),
                              p.location_city,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
