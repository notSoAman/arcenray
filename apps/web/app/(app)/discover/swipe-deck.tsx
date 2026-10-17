"use client";

import Link from "next/link";
import { useRef, useState, type PointerEvent } from "react";
import { IconClose, IconHeart, IconPlay } from "../../../components/icons";
import { HookPreview } from "../../../components/hook-preview";
import { Avatar, Poster } from "../../../components/media";
import { likeFilm } from "../../../components/wavelength";
import { recordEvent } from "../../../lib/client-api";
import { formatDuration, type FeedFilm } from "../../../lib/feed";
import styles from "./swipe-deck.module.css";

const THRESHOLD = 110;

/**
 * Phone swipe deck (03 Discover). Drag right = Same wavelength (like),
 * left = Not my niche (skip). Buttons do the same for keyboard and screen readers.
 */
export function SwipeDeck({
  films,
  viewerId,
}: {
  films: FeedFilm[];
  viewerId: string | null;
}) {
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; id: number } | null>(null);

  const cur = films[index];
  const next = films[index + 1];

  function decide(dir: "left" | "right") {
    if (!cur || leaving) return;
    if (!viewerId) {
      window.location.assign(
        `/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
      return;
    }
    setLeaving(dir);
    const film = cur;
    if (dir === "left") {
      recordEvent(film.id, "skip");
      setNotice(`Fewer like ${film.title}`);
    } else {
      setNotice(`Liked ${film.title}`);
      void likeFilm(film.id).then((ok) => {
        if (!ok) setNotice(`Couldn't save your like for ${film.title}`);
      });
    }
    window.setTimeout(() => {
      setIndex((i) => i + 1);
      setDx(0);
      setLeaving(null);
    }, 260);
  }

  function onDown(e: PointerEvent<HTMLElement>) {
    if ((e.target as HTMLElement).closest("a,button")) return;
    start.current = { x: e.clientX, id: e.pointerId };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e: PointerEvent<HTMLElement>) {
    if (start.current?.id !== e.pointerId) return;
    setDx(e.clientX - start.current.x);
  }
  function onUp(e: PointerEvent<HTMLElement>) {
    if (start.current?.id !== e.pointerId) return;
    start.current = null;
    setDragging(false);
    if (dx > THRESHOLD) decide("right");
    else if (dx < -THRESHOLD) decide("left");
    else setDx(0);
  }

  if (!cur) {
    return (
      <div className="state-panel">
        <h2>That&apos;s the deck.</h2>
        <p>
          You&apos;ve been through every film here. Your likes shape what you
          see next.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setIndex(0)}
        >
          Start over
        </button>
      </div>
    );
  }

  const offset = leaving === "right" ? 520 : leaving === "left" ? -520 : dx;
  const stamp = offset > 30 ? "like" : offset < -30 ? "pass" : null;
  const length = formatDuration(cur.duration_seconds);

  return (
    <div className={styles.wrap}>
      <p className="visually-hidden" aria-live="polite">
        {notice}
      </p>
      <div className={styles.stack}>
        {next ? (
          <div className={styles.next} aria-hidden="true">
            <Poster
              posterKey={next.poster_key}
              title={next.title}
              sizes="90vw"
            />
          </div>
        ) : null}
        <article
          className={styles.card}
          aria-label={`${cur.title}${cur.creator ? ` by ${cur.creator.full_name}` : ""}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => {
            start.current = null;
            setDragging(false);
            setDx(0);
          }}
          style={{
            transform: `translateX(${offset}px) rotate(${offset / 22}deg)`,
            transition: dragging ? "none" : "transform 260ms ease",
          }}
        >
          <HookPreview
            key={cur.id}
            filmId={cur.id}
            hookKey={cur.hook_key}
            posterKey={cur.poster_key}
            title={cur.title}
            sizes="90vw"
            active={!leaving}
          />
          <span className={styles.shade} aria-hidden="true" />
          <div className={styles.top}>
            <span className={`${styles.counter} glass`}>
              {index + 1} / {films.length}
            </span>
            {cur.genres[0] || length ? (
              <span className={`kicker ${styles.meta}`}>
                {[cur.genres[0], length].filter(Boolean).join(" · ")}
              </span>
            ) : null}
          </div>
          {stamp ? (
            <span
              className={styles.stamp}
              data-kind={stamp}
              aria-hidden="true"
              style={{ opacity: Math.min(1, Math.abs(offset) / THRESHOLD) }}
            >
              {stamp === "like" ? "SAME WAVELENGTH" : "NOT MY NICHE"}
            </span>
          ) : null}
          <div className={styles.bottom}>
            {cur.creator ? (
              <Link href={`/u/${cur.creator.handle}`} className={styles.maker}>
                <Avatar
                  picKey={cur.creator.profile_pic_key}
                  name={cur.creator.full_name}
                  size={34}
                />
                <span className={styles.makerName}>
                  {cur.creator.full_name}
                </span>
                {cur.location_city ? (
                  <span className={styles.city}>· {cur.location_city}</span>
                ) : null}
              </Link>
            ) : null}
            <Link href={`/films/${cur.id}`} className={styles.title}>
              {cur.title}
            </Link>
            {cur.synopsis ? (
              <p className={styles.line}>{cur.synopsis}</p>
            ) : null}
            <div className={styles.controls}>
              <button
                type="button"
                className={styles.pass}
                onClick={() => decide("left")}
                aria-label="Not my niche"
              >
                <IconClose size={22} />
              </button>
              <Link href={`/watch/${cur.id}`} className={styles.watch}>
                <IconPlay size={14} />
                Watch
              </Link>
              <button
                type="button"
                className={styles.like}
                onClick={() => decide("right")}
                aria-label="Same wavelength"
              >
                <IconHeart size={22} filled />
              </button>
            </div>
          </div>
        </article>
      </div>
      <p className={`kicker ${styles.hint}`} aria-hidden="true">
        Swipe · right for same wavelength
      </p>
    </div>
  );
}
