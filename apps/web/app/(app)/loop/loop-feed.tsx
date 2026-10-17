"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { HookPreview } from "../../../components/hook-preview";
import { IconPlay } from "../../../components/icons";
import { Avatar } from "../../../components/media";
import { browserApi } from "../../../lib/client-api";
import { formatDuration, withCreators, type FeedFilm } from "../../../lib/feed";
import styles from "./loop.module.css";

const PAGE_SIZE = 10;
const MAX_SEEN = 10000;
type Preference = "more" | "less";

export function LoopFeed({
  initialFilms,
  initialFailed,
  initialHasMore,
  initialPreferences,
  preferencesFailed,
  viewerId,
}: {
  initialFilms: FeedFilm[];
  initialFailed: boolean;
  initialHasMore: boolean;
  initialPreferences: { film_id: string; preference: string }[];
  preferencesFailed: boolean;
  viewerId: string | null;
}) {
  const [films, setFilms] = useState(initialFilms);
  const [seenCount, setSeenCount] = useState(initialFilms.length);
  const [hasMore, setHasMore] = useState(initialFailed || initialHasMore);
  const [error, setError] = useState(
    initialFailed ? "We couldn’t load Loop. Try again." : "",
  );
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialPreferences.map((p) => [p.film_id, p.preference]),
    ),
  );
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState(
    preferencesFailed
      ? "Your saved preferences couldn’t be loaded. You can still browse."
      : "",
  );
  const seen = useRef(new Set(initialFilms.map((film) => film.id)));
  const busy = useRef(false);
  const feedbackBusy = useRef(new Set<string>());
  const cards = useRef(new Map<string, HTMLElement>());
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore) return;
    if (seen.current.size >= MAX_SEEN) {
      setHasMore(false);
      return;
    }
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      const api = browserApi();
      const { data, error: failure } = await api.loop.page(
        [...seen.current],
        PAGE_SIZE,
      );
      if (failure || !data) throw new Error("feed unavailable");
      const batchIds = new Set<string>();
      const fresh = data.filter((film) => {
        if (seen.current.has(film.id) || batchIds.has(film.id)) return false;
        batchIds.add(film.id);
        return true;
      });
      const attached = await withCreators(api.supabase, fresh);
      for (const film of fresh) seen.current.add(film.id);
      setSeenCount(seen.current.size);
      setFilms((previous) => [...previous, ...attached]);
      // Empty or duplicate-only pages stop automatic requests rather than looping.
      setHasMore(
        data.length === PAGE_SIZE &&
          fresh.length > 0 &&
          seen.current.size < MAX_SEEN,
      );
    } catch {
      setError("We couldn’t load more films. Your place is saved; try again.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [hasMore]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || !hasMore || error || loading) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMore();
      },
      { rootMargin: "320px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, error, loading, loadMore]);

  useEffect(() => {
    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.filmId;
          if (id)
            ratios.set(id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        let best: string | null = null;
        let ratio = 0;
        for (const [id, visible] of ratios) {
          if (visible > ratio) {
            best = id;
            ratio = visible;
          }
        }
        setActiveId(best);
      },
      {
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
        rootMargin: "-72px 0px 0px 0px",
      },
    );
    for (const card of cards.current.values()) observer.observe(card);
    return () => observer.disconnect();
  }, [films]);

  async function savePreference(film: FeedFilm, preference: Preference) {
    if (!viewerId) {
      window.location.assign(`/sign-in?next=${encodeURIComponent("/loop")}`);
      return;
    }
    if (feedbackBusy.current.has(film.id)) return;
    feedbackBusy.current.add(film.id);
    setPending((previous) => ({ ...previous, [film.id]: true }));
    try {
      const { error: failure } = await browserApi().loop.feedback(
        film.id,
        preference,
      );
      if (failure) throw new Error("feedback unavailable");
      setPreferences((previous) => ({ ...previous, [film.id]: preference }));
      setNotice(
        preference === "more"
          ? `Saved. We’ll suggest more films like ${film.title}.`
          : `Saved. We’ll suggest fewer films like ${film.title}.`,
      );
      if (preference === "less")
        setFilms((previous) => previous.filter((item) => item.id !== film.id));
    } catch {
      setNotice(
        `We couldn’t save your preference for ${film.title}. Please try again.`,
      );
    } finally {
      feedbackBusy.current.delete(film.id);
      setPending((previous) => ({ ...previous, [film.id]: false }));
    }
  }

  return (
    <>
      <p className={styles.notice} role="status" aria-live="polite">
        {notice}
      </p>
      <div className={styles.feed} aria-label="Short film previews">
        {films.map((film) => (
          <article
            className={styles.card}
            key={film.id}
            data-film-id={film.id}
            aria-labelledby={`film-${film.id}`}
            ref={(element) => {
              if (element) cards.current.set(film.id, element);
              else cards.current.delete(film.id);
            }}
          >
            <div className={styles.preview}>
              <HookPreview
                filmId={film.id}
                hookKey={film.hook_key}
                posterKey={film.poster_key}
                title={film.title}
                sizes="(max-width: 800px) 100vw, 800px"
                active={activeId === film.id}
                controlled={true}
              />
              <span className={`kicker glass ${styles.previewLabel}`}>
                Film preview
              </span>
            </div>
            <div className={styles.details}>
              <div className={`kicker ${styles.meta}`}>
                {[
                  ...film.genres.slice(0, 2),
                  formatDuration(film.duration_seconds),
                  film.location_city,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <h2 id={`film-${film.id}`} className={styles.title}>
                <Link href={`/films/${film.id}`}>{film.title}</Link>
              </h2>
              {film.creator ? (
                <Link
                  href={`/u/${film.creator.handle}`}
                  className={styles.creator}
                >
                  <Avatar
                    picKey={film.creator.profile_pic_key}
                    name={film.creator.full_name}
                    size={32}
                  />
                  <span>
                    {film.creator.full_name}
                    <span className={styles.handle}>
                      {" "}
                      @{film.creator.handle}
                    </span>
                  </span>
                </Link>
              ) : (
                <p className={styles.meta}>Independent filmmaker</p>
              )}
              {film.synopsis ? (
                <p className={styles.synopsis}>{film.synopsis}</p>
              ) : null}
              <div className={styles.actions}>
                <Link href={`/watch/${film.id}`} className="btn btn-primary">
                  <IconPlay size={15} /> Watch film
                </Link>
                <div
                  className={styles.feedback}
                  role="group"
                  aria-label={`Shape recommendations for ${film.title}`}
                  aria-busy={Boolean(pending[film.id])}
                >
                  <button
                    type="button"
                    aria-pressed={preferences[film.id] === "more"}
                    disabled={pending[film.id]}
                    onClick={() => void savePreference(film, "more")}
                  >
                    More like this
                  </button>
                  <button
                    type="button"
                    aria-pressed={preferences[film.id] === "less"}
                    disabled={pending[film.id]}
                    onClick={() => void savePreference(film, "less")}
                  >
                    Less like this
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
      {films.length === 0 && !loading && !error && !hasMore ? (
        <div className="state-panel">
          <h2>
            {seenCount
              ? "You’re all caught up"
              : "The first films are on their way"}
          </h2>
          <p>
            {seenCount
              ? "Your preferences are saved. Come back for new films."
              : "Published films and their previews will appear here."}
          </p>
          <Link
            href={viewerId ? "/publish" : "/sign-in?next=%2Fpublish"}
            className="btn btn-primary"
          >
            Share a film
          </Link>
        </div>
      ) : null}
      <div ref={sentinel} className={styles.pagination}>
        {error ? <p role="alert">{error}</p> : null}
        {loading ? (
          <p role="status">Loading more films…</p>
        ) : hasMore ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void loadMore()}
          >
            {error ? "Try again" : "Load more films"}
          </button>
        ) : films.length ? (
          <p>You’re all caught up. Come back for new films.</p>
        ) : null}
      </div>
    </>
  );
}
