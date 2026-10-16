"use client";

import { useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { FEED_PAGE, loadFeedPage, type FeedFilm } from "../../lib/feed";
import { FilmCard } from "./film-card";
import styles from "./home.module.css";

/** Appends further feed pages on request; keeps loaded films if a page fails. */
export function FeedMore({
  start,
  initialHasMore,
}: {
  start: number;
  initialHasMore: boolean;
}) {
  const [films, setFilms] = useState<FeedFilm[]>([]);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function loadMore() {
    setState("loading");
    try {
      const page = await loadFeedPage(createClient(), start + films.length);
      if (!page.ok) {
        setState("error");
        return;
      }
      setFilms((current) => {
        const seen = new Set(current.map((f) => f.id));
        return [...current, ...page.films.filter((f) => !seen.has(f.id))];
      });
      setHasMore(page.hasMore);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      {films.length > 0 ? (
        <div className={styles.grid} aria-label={`${films.length} more films`}>
          {films.map((film) => (
            <FilmCard key={film.id} film={film} />
          ))}
        </div>
      ) : null}
      <div className={styles.more} aria-live="polite">
        {state === "error" ? (
          <p className="field-error" role="alert">
            Couldn&apos;t load more films. Check your connection and try again.
          </p>
        ) : null}
        {hasMore ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={loadMore}
            disabled={state === "loading"}
          >
            {state === "loading"
              ? "Loading…"
              : state === "error"
                ? "Try again"
                : `Show ${FEED_PAGE} more`}
          </button>
        ) : (
          <p className={styles.endNote}>You&apos;re all caught up.</p>
        )}
      </div>
    </>
  );
}
