import Image from "next/image";
import { formatDuration, mediaUrl, type FeedFilm } from "../../lib/feed";
import { personRole } from "../../lib/roles";
import styles from "./home.module.css";

function Poster({
  film,
  sizes,
  eager,
}: {
  film: FeedFilm;
  sizes: string;
  eager?: boolean;
}) {
  const src = mediaUrl(film.poster_key);
  if (!src) {
    // No poster yet: signature spectrum with the title, never a broken image.
    return (
      <span
        className={`${styles.posterFallback} spectrum-strip`}
        aria-hidden="true"
      >
        <span>{film.title}</span>
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      className={styles.posterImage}
      // Posters are already prepared as ≤800×1200 WebP before upload.
      unoptimized
      loading={eager ? "eager" : "lazy"}
    />
  );
}

function meta(film: FeedFilm) {
  return [film.genres[0], formatDuration(film.duration_seconds)]
    .filter(Boolean)
    .join(" · ");
}

function byline(film: FeedFilm) {
  if (!film.creator) return null;
  const parts = [film.creator.full_name || `@${film.creator.handle}`];
  const role = personRole(film.creator.roles[0]);
  if (role) parts.push(role);
  const city = film.location_city ?? film.creator.location_city;
  if (city) parts.push(city);
  return parts.join(" · ");
}

export function FilmCard({ film }: { film: FeedFilm }) {
  const info = meta(film);
  const by = byline(film);
  return (
    <article className={styles.card}>
      <div className={styles.poster}>
        <Poster
          film={film}
          sizes="(max-width: 640px) 50vw, (max-width: 1100px) 33vw, 240px"
        />
        {info ? <span className={styles.badge}>{info}</span> : null}
      </div>
      <h3 className={styles.cardTitle}>{film.title}</h3>
      {by ? <p className={styles.cardBy}>{by}</p> : null}
    </article>
  );
}

export function FeaturedFilm({ film }: { film: FeedFilm }) {
  const by = byline(film);
  const length = formatDuration(film.duration_seconds);
  return (
    <section
      className={`${styles.featured} spectrum-hero`}
      aria-labelledby="featured-title"
    >
      <span className={styles.featuredShade} aria-hidden="true" />
      <div className={styles.featuredPoster}>
        <Poster film={film} sizes="(max-width: 640px) 60vw, 300px" eager />
      </div>
      <div className={styles.featuredCopy}>
        <span className={`kicker ${styles.featuredKicker}`}>
          Tonight&apos;s pick
        </span>
        <h2 id="featured-title" className={styles.featuredTitle}>
          {film.title}
        </h2>
        {by ? <p className={styles.featuredBy}>{by}</p> : null}
        {film.synopsis ? (
          <p className={styles.featuredSynopsis}>{film.synopsis}</p>
        ) : null}
        {film.genres.length > 0 || length ? (
          <ul className={styles.tags} aria-label="Details">
            {film.genres.slice(0, 3).map((g) => (
              <li key={g}>{g}</li>
            ))}
            {length ? <li>{length}</li> : null}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
