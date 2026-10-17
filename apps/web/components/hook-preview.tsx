"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { newId, recordEvent } from "../lib/client-api";
import { mediaUrl } from "../lib/feed";
import { IconPlay, IconVolume } from "./icons";
import { Poster } from "./media";
import styles from "./hook-preview.module.css";

const LIGHT_SIGNAL_SECONDS = 10;
const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/**
 * The film's ≤30-second hook, muted by default with a visible sound control.
 * Plays on intent (hover/focus/tap) or when `active`; never autoplays with
 * reduced motion. Watching ≥10 s sends one light taste signal.
 */
export function HookPreview({
  filmId,
  hookKey,
  posterKey,
  title,
  sizes,
  active = false,
}: {
  filmId: string;
  hookKey: string | null;
  posterKey: string | null;
  title: string;
  sizes: string;
  active?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const sent = useRef(false);
  const key = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => true,
  );
  const src = mediaUrl(hookKey);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active && !reduced) void v.play().catch(() => undefined);
    else if (!active) v.pause();
  }, [active, reduced]);

  if (!src) {
    return <Poster posterKey={posterKey} title={title} sizes={sizes} />;
  }

  const start = () => {
    if (!reduced) void video.current?.play().catch(() => undefined);
  };
  const stop = () => {
    if (!active) video.current?.pause();
  };

  return (
    <span
      className={styles.wrap}
      onMouseEnter={start}
      onMouseLeave={stop}
      onFocus={start}
      onBlur={stop}
    >
      <Poster posterKey={posterKey} title={title} sizes={sizes} />
      <video
        ref={video}
        src={src}
        muted={muted}
        loop
        playsInline
        preload="none"
        className={styles.video}
        data-playing={playing ? "true" : undefined}
        aria-label={`${title} — preview`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          if (
            !sent.current &&
            e.currentTarget.currentTime >= LIGHT_SIGNAL_SECONDS
          ) {
            sent.current = true;
            key.current ??= newId();
            recordEvent(
              filmId,
              "hook_watch",
              e.currentTarget.currentTime,
              key.current,
            );
          }
        }}
      />
      {playing ? (
        <button
          type="button"
          className={`${styles.sound} glass`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMuted(!muted);
          }}
          aria-label={muted ? "Turn preview sound on" : "Mute preview"}
        >
          <IconVolume size={18} muted={muted} />
        </button>
      ) : (
        <button
          type="button"
          className={`${styles.preview} glass`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void video.current?.play().catch(() => undefined);
          }}
          aria-label={`Play preview of ${title}`}
        >
          <IconPlay size={14} />
          Preview
        </button>
      )}
    </span>
  );
}
