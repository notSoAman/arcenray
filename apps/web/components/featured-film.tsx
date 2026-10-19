import Link from "next/link";
import { formatDuration, type FeedFilm } from "../lib/feed";
import { byline } from "./film-cards";
import { IconPlay } from "./icons";
import { HookPreview } from "./hook-preview";
import styles from "./featured-film.module.css";

/** Cinematic spectrum panel with the poster on a calm surface (W1, W2). */
export function FeaturedFilm({
  film,
  kicker,
}: {
  film: FeedFilm;
  kicker: string;
}) {
  const by = byline(film, { role: true });
  const length = formatDuration(film.duration_seconds);
  return (
    <section
      className={`${styles.featured} spectrum-hero`}
      aria-labelledby={`featured-${film.id}`}
    >
      <span className={styles.shade} aria-hidden="true" />
      <div className={styles.poster}>
        <HookPreview
          filmId={film.id}
          hookKey={film.hook_key}
          posterKey={film.poster_key}
          title={film.title}
          sizes="(max-width: 720px) 60vw, 300px"
        />
      </div>
      <div className={styles.copy}>
        <span className={`kicker ${styles.kicker}`}>{kicker}</span>
        <h2 id={`featured-${film.id}`} className={styles.title}>
          <Link href={`/films/${film.id}`}>{film.title}</Link>
        </h2>
        {by ? <p className={styles.by}>{by}</p> : null}
        {film.synopsis ? (
          <p className={styles.synopsis}>{film.synopsis}</p>
        ) : null}
        {film.genres.length > 0 || length ? (
          <ul className={styles.tags} aria-label="Details">
            {film.genres.slice(0, 3).map((g) => (
              <li key={g}>{g}</li>
            ))}
            {length ? <li>{length}</li> : null}
          </ul>
        ) : null}
        <div className={styles.actions}>
          <Link href={`/watch/${film.id}`} className="btn btn-film-play">
            <IconPlay size={16} />
            Play
          </Link>
          <Link href={`/films/${film.id}`} className="btn btn-film-details">
            Details
          </Link>
        </div>
      </div>
    </section>
  );
}
