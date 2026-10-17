import Link from "next/link";
import { formatDuration, type FeedFilm, type FilmRow } from "../lib/feed";
import { personRole } from "../lib/roles";
import { Poster } from "./media";
import styles from "./film-cards.module.css";

export function filmMeta(film: Pick<FilmRow, "genres" | "duration_seconds">) {
  return [film.genres[0], formatDuration(film.duration_seconds)]
    .filter(Boolean)
    .join(" · ");
}

export function byline(film: FeedFilm, opts: { role?: boolean } = {}) {
  if (!film.creator) return null;
  const parts = [film.creator.full_name || `@${film.creator.handle}`];
  const role = opts.role ? personRole(film.creator.roles[0]) : null;
  if (role) parts.push(role);
  const city = film.location_city ?? film.creator.location_city;
  if (city) parts.push(city);
  return parts.join(" · ");
}

/** Portrait poster card (home, discover grids). */
export function PosterCard({
  film,
  eager,
}: {
  film: FeedFilm;
  eager?: boolean;
}) {
  const length = formatDuration(film.duration_seconds);
  const by = byline(film);
  return (
    <Link href={`/films/${film.id}`} className={styles.card}>
      <span className={styles.poster}>
        <Poster
          posterKey={film.poster_key}
          title={film.title}
          sizes="(max-width: 720px) 50vw, (max-width: 1100px) 33vw, 240px"
          eager={eager}
        />
        {length ? <span className={styles.badge}>{length}</span> : null}
      </span>
      <span className={styles.title}>{film.title}</span>
      {by ? <span className={styles.by}>{by}</span> : null}
    </Link>
  );
}

/** Landscape card (related films, profile films). */
export function WideCard({
  film,
  note,
}: {
  film: FeedFilm | FilmRow;
  note?: string | null;
}) {
  const length = formatDuration(film.duration_seconds);
  const by = "creator" in film ? byline(film) : null;
  const sub = [by, note ?? null].filter(Boolean).join(" · ") || filmMeta(film);
  return (
    <Link href={`/films/${film.id}`} className={styles.card}>
      <span className={`${styles.poster} ${styles.wide}`}>
        <Poster
          posterKey={film.poster_key}
          title={film.title}
          sizes="(max-width: 720px) 100vw, 360px"
        />
        {length ? <span className={styles.badge}>{length}</span> : null}
      </span>
      <span className={styles.title}>{film.title}</span>
      {sub ? <span className={styles.by}>{sub}</span> : null}
    </Link>
  );
}

/** Horizontal result row (search). */
export function RowCard({ film }: { film: FeedFilm }) {
  const length = formatDuration(film.duration_seconds);
  const sub = [film.creator?.full_name, film.genres[0], film.location_city]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link href={`/films/${film.id}`} className={styles.row}>
      <span className={styles.rowPoster}>
        <Poster posterKey={film.poster_key} title={film.title} sizes="120px" />
        {length ? <span className={styles.badge}>{length}</span> : null}
      </span>
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>{film.title}</span>
        {sub ? <span className={styles.by}>{sub}</span> : null}
        {film.synopsis ? (
          <span className={styles.rowLine}>{film.synopsis}</span>
        ) : null}
      </span>
    </Link>
  );
}
