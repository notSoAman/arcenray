"use client";

import Link from "next/link";
import { useState } from "react";
import { browserApi, recordEvent } from "../lib/client-api";
import { formatDuration, type FeedFilm } from "../lib/feed";
import { MessageButton } from "./message-button";
import { Poster } from "./media";
import styles from "./wavelength.module.css";

type Choice = "like" | "pass";

/** Like a published film: likes table row (idempotent) + a strong taste signal. */
export async function likeFilm(filmId: string) {
  const api = browserApi();
  const { data } = await api.supabase.auth.getUser();
  if (!data.user) return false;
  const { error } = await api.supabase
    .from("film_likes")
    .insert({ user_id: data.user.id, film_id: filmId });
  if (error && error.code !== "23505") return false;
  recordEvent(filmId, "like");
  return true;
}

/**
 * "Same wavelength / Not my niche" picks (W1). Likes and skips are real taste
 * events; there is no mutual-match feature, so a like offers to message the maker.
 */
export function WavelengthPicks({
  films,
  viewerId,
}: {
  films: FeedFilm[];
  viewerId: string;
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const decided = Object.keys(choices).length;
  const liked = Object.values(choices).filter((c) => c === "like").length;

  async function choose(film: FeedFilm, choice: Choice) {
    setFailed(null);
    setChoices((c) => ({ ...c, [film.id]: choice }));
    if (choice === "pass") {
      recordEvent(film.id, "skip");
      return;
    }
    const ok = await likeFilm(film.id);
    if (!ok) {
      setFailed(film.id);
      setChoices((c) => {
        const next = { ...c };
        delete next[film.id];
        return next;
      });
    }
  }

  return (
    <section className={styles.section} aria-labelledby="wavelength-title">
      <div className={styles.head}>
        <div className={styles.headCopy}>
          <span className="kicker page-kicker">
            Your wavelength · {films.length} picks tonight
          </span>
          <h2 id="wavelength-title" className={styles.title}>
            Same wavelength, or not your niche?
          </h2>
        </div>
        <span className={styles.count} aria-live="polite">
          {decided === films.length
            ? `That's tonight's picks. ${liked} liked.`
            : `${films.length - decided} left tonight`}
        </span>
      </div>
      <div className={styles.grid}>
        {films.map((film) => {
          const choice = choices[film.id];
          const first =
            film.creator?.full_name.split(/\s+/)[0] ||
            (film.creator ? `@${film.creator.handle}` : null);
          const meta = [film.genres[0], formatDuration(film.duration_seconds)]
            .filter(Boolean)
            .join(" · ");
          return (
            <article
              key={film.id}
              className={styles.card}
              data-choice={choice ?? "open"}
            >
              <Link href={`/films/${film.id}`} className={styles.art}>
                <Poster
                  posterKey={film.poster_key}
                  title={film.title}
                  sizes="(max-width: 720px) 50vw, 260px"
                />
                {meta ? <span className={styles.badge}>{meta}</span> : null}
              </Link>
              <div className={styles.body}>
                <Link href={`/films/${film.id}`} className={styles.filmTitle}>
                  {film.title}
                </Link>
                {film.creator ? (
                  <Link
                    href={`/u/${film.creator.handle}`}
                    className={styles.by}
                  >
                    {film.creator.full_name}
                    {film.location_city ? ` · ${film.location_city}` : ""}
                  </Link>
                ) : null}
                {failed === film.id ? (
                  <p className="field-error" role="alert">
                    Couldn&apos;t save that. Try again.
                  </p>
                ) : null}
                {!choice ? (
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.pass}
                      onClick={() => choose(film, "pass")}
                    >
                      Not my niche
                    </button>
                    <button
                      type="button"
                      className={styles.like}
                      onClick={() => choose(film, "like")}
                    >
                      Same wavelength
                    </button>
                  </div>
                ) : choice === "like" ? (
                  film.creator && film.creator.id !== viewerId && first ? (
                    <MessageButton
                      userId={film.creator.id}
                      className={styles.liked}
                    >
                      Liked · say hello to {first}
                    </MessageButton>
                  ) : (
                    <span className={styles.liked}>Liked</span>
                  )
                ) : (
                  <span className={styles.passed}>Fewer like this</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
