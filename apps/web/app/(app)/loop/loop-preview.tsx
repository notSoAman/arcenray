"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { newId, recordEvent } from "../../../lib/client-api";
import { mediaUrl } from "../../../lib/feed";
import { Poster } from "../../../components/media";
import styles from "./loop.module.css";

const reducedQuery = "(prefers-reduced-motion: reduce)";
function subscribeReduced(change: () => void) {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
function subscribeVisible(change: () => void) {
  document.addEventListener("visibilitychange", change);
  return () => document.removeEventListener("visibilitychange", change);
}

/** Mounted for the active slide only, so offscreen videos cannot keep playing. */
export function LoopPreview({
  filmId,
  title,
  hookKey,
  posterKey,
  muted,
  onMute,
}: {
  filmId: string;
  title: string;
  hookKey: string;
  posterKey: string | null;
  muted: boolean;
  onMute: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const eventId = useRef<string | null>(null);
  const recorded = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(reducedQuery).matches,
    () => true,
  );
  const visible = useSyncExternalStore(
    subscribeVisible,
    () => !document.hidden,
    () => false,
  );
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (visible && !reduced) void element.play().catch(() => undefined);
    else element.pause();
    return () => element.pause();
  }, [visible, reduced]);
  const src = mediaUrl(hookKey);
  return (
    <>
      <Poster
        posterKey={posterKey}
        title={title}
        sizes="(max-width: 600px) 100vw, 440px"
      />
      {src && !failed && (
        <video
          ref={video}
          src={src}
          poster={mediaUrl(posterKey) ?? undefined}
          className={styles.video}
          playsInline
          loop
          muted={muted}
          preload="metadata"
          aria-label={`${title} preview`}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setFailed(true)}
          onTimeUpdate={(event) => {
            const element = event.currentTarget;
            setProgress(
              element.duration > 0 ? element.currentTime / element.duration : 0,
            );
            if (!recorded.current && element.currentTime >= 10) {
              recorded.current = true;
              eventId.current ??= newId();
              recordEvent(
                filmId,
                "hook_watch",
                element.currentTime,
                eventId.current,
              );
            }
          }}
        />
      )}
      {!failed && src && (
        <>
          <button
            type="button"
            className={styles.tapTarget}
            aria-label={`${playing ? "Pause" : "Play"} preview of ${title}`}
            onClick={() => {
              const element = video.current;
              if (!element) return;
              if (element.paused) void element.play().catch(() => undefined);
              else element.pause();
            }}
          >
            <span className={styles.playHint}>{playing ? "Ⅱ" : "▶"}</span>
          </button>
          <button
            type="button"
            className={styles.sound}
            onClick={onMute}
            aria-label={muted ? "Turn preview sound on" : "Mute preview"}
          >
            {muted ? "Sound off" : "Sound on"}
          </button>
          <div className={styles.progress} aria-hidden="true">
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
        </>
      )}
      {failed && (
        <p className={styles.playbackError} role="status">
          Preview unavailable. You can still open the film.
        </p>
      )}
    </>
  );
}
