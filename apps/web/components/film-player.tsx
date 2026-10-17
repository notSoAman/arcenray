"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { newId, recordEvent } from "../lib/client-api";
import { formatClock, mediaUrl } from "../lib/feed";
import {
  IconBack,
  IconExpand,
  IconForward,
  IconPause,
  IconPlay,
  IconRewind,
  IconVolume,
} from "./icons";
import styles from "./film-player.module.css";

export type PlayableFilm = {
  id: string;
  title: string;
  source: string;
  film_key: string | null;
  provider_id: string | null;
  poster_key: string | null;
  duration_seconds: number | null;
};

/** Validated provider embed URLs (IDs are validated by the shared contract). */
function embedUrl(film: PlayableFilm, autoplay: boolean) {
  if (!film.provider_id) return null;
  if (
    film.source === "youtube_embed" &&
    /^[A-Za-z0-9_-]{11}$/.test(film.provider_id)
  )
    return `https://www.youtube-nocookie.com/embed/${film.provider_id}?rel=0&modestbranding=1${autoplay ? "&autoplay=1" : ""}`;
  if (film.source === "vimeo_embed" && /^\d+$/.test(film.provider_id))
    return `https://player.vimeo.com/video/${film.provider_id}?dnt=1${autoplay ? "&autoplay=1" : ""}`;
  return null;
}

/**
 * Native R2 playback with custom controls (seek via HTTP Range), or a compliant
 * Vimeo/YouTube embed using the provider's own controls.
 */
export function FilmPlayer({
  film,
  variant,
  autoPlay = false,
  exitHref,
  header,
  aside,
}: {
  film: PlayableFilm;
  variant: "inline" | "immersive";
  autoPlay?: boolean;
  exitHref?: string;
  header?: ReactNode;
  aside?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const completeKey = useRef<string | null>(null);
  const hideTimer = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(film.duration_seconds ?? 0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [chrome, setChrome] = useState(true);
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const src = film.source === "r2_native" ? mediaUrl(film.film_key) : null;
  const embed = film.source !== "r2_native" ? embedUrl(film, autoPlay) : null;
  const poster = mediaUrl(film.poster_key) ?? undefined;

  useEffect(() => {
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  function wake() {
    setChrome(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    if (variant === "immersive")
      hideTimer.current = window.setTimeout(() => {
        if (video.current && !video.current.paused) setChrome(false);
      }, 2800);
  }

  function toggle() {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => setFailed(true));
    else v.pause();
    wake();
  }

  function seekBy(delta: number) {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.min(
      Math.max(0, v.currentTime + delta),
      v.duration || Infinity,
    );
    wake();
  }

  function setMute(next: boolean) {
    if (video.current) video.current.muted = next;
    setMuted(next);
  }

  function fullscreen() {
    const el = root.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => undefined);
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === " " || e.key === "k") {
      e.preventDefault();
      toggle();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      seekBy(10);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      seekBy(-10);
    } else if (e.key === "m") setMute(!muted);
    else if (e.key === "f") fullscreen();
  }

  // Immersive pages always keep an exit and the title above the frame.
  const staticTop =
    variant === "immersive" ? (
      <div className={`${styles.topBar} ${styles.staticTop}`}>
        {exitHref ? (
          <Link
            href={exitHref}
            className={`${styles.round} glass`}
            aria-label="Exit player"
          >
            <IconBack size={22} />
          </Link>
        ) : null}
        {header}
      </div>
    ) : null;

  if (embed) {
    return (
      <div className={`${styles.root} ${styles[variant]}`}>
        {staticTop}
        <div className={styles.frame}>
          <iframe
            src={embed}
            title={`${film.title} — external player`}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className={styles.iframe}
          />
        </div>
        <p className={styles.embedNote}>
          Playing from {film.source === "vimeo_embed" ? "Vimeo" : "YouTube"}.
          Their player, controls and terms apply.
        </p>
      </div>
    );
  }

  if (!src || failed) {
    return (
      <div className={`${styles.root} ${styles[variant]}`}>
        {staticTop}
        <div className={`${styles.frame} ${styles.unavailable} spectrum-hero`}>
          <span className={styles.unavailableShade} aria-hidden="true" />
          <div className={styles.unavailableText} role="status">
            <strong>
              {failed
                ? "This film couldn't play."
                : "This film isn't available to play yet."}
            </strong>
            <span>
              {failed
                ? "Your browser may not support this file, or the connection dropped. Try again or reload."
                : "The creator's video is still being prepared."}
            </span>
            {failed ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setFailed(false)}
              >
                Try again
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const pct = duration > 0 ? (time / duration) * 100 : 0;

  return (
    <div
      ref={root}
      className={`${styles.root} ${styles[variant]}`}
      data-chrome={chrome || !playing ? "on" : "off"}
      onMouseMove={wake}
      onKeyDown={onKey}
      tabIndex={-1}
      role="region"
      aria-label={`${film.title} player`}
    >
      <div className={styles.frame}>
        <video
          ref={video}
          src={src}
          poster={poster}
          preload="metadata"
          playsInline
          autoPlay={autoPlay}
          className={styles.video}
          onClick={toggle}
          onPlay={() => {
            setPlaying(true);
            wake();
          }}
          onPause={() => {
            setPlaying(false);
            setChrome(true);
          }}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            if (Number.isFinite(e.currentTarget.duration))
              setDuration(e.currentTarget.duration);
          }}
          onProgress={(e) => {
            const b = e.currentTarget.buffered;
            if (b.length) setBuffered(b.end(b.length - 1));
          }}
          onEnded={() => {
            setPlaying(false);
            setChrome(true);
            completeKey.current ??= newId();
            recordEvent(
              film.id,
              "film_complete",
              duration,
              completeKey.current,
            );
          }}
          onError={() => setFailed(true)}
        />
        {waiting && playing ? (
          <span className={styles.spinner} aria-hidden="true" />
        ) : null}

        {variant === "immersive" ? (
          <div className={styles.overlay}>
            <span className={styles.gradient} aria-hidden="true" />
            <div className={styles.topBar}>
              {exitHref ? (
                <Link
                  href={exitHref}
                  className={`${styles.round} glass`}
                  aria-label="Exit player"
                >
                  <IconBack size={22} />
                </Link>
              ) : null}
              {header}
            </div>
            <div className={styles.center}>
              <button
                type="button"
                className={styles.skip}
                onClick={() => seekBy(-10)}
                aria-label="Back 10 seconds"
              >
                <IconRewind size={30} />
                <span>10</span>
              </button>
              <button
                type="button"
                className={styles.bigPlay}
                onClick={toggle}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <IconPause size={34} /> : <IconPlay size={34} />}
              </button>
              <button
                type="button"
                className={styles.skip}
                onClick={() => seekBy(10)}
                aria-label="Forward 10 seconds"
              >
                <IconForward size={30} />
                <span>10</span>
              </button>
            </div>
            <div className={styles.bottom}>
              {aside ? <div className={styles.aside}>{aside}</div> : null}
              <Seek
                time={time}
                duration={duration}
                buffered={buffered}
                onSeek={(t) => {
                  if (video.current) video.current.currentTime = t;
                }}
                big
              />
              <div className={styles.row}>
                <span className={styles.clock}>
                  {formatClock(time)} <span>/ {formatClock(duration)}</span>
                </span>
                <span className={styles.spacer} />
                <VolumeControls
                  muted={muted}
                  volume={volume}
                  onMute={setMute}
                  onVolume={(v) => {
                    if (video.current) video.current.volume = v;
                    setVolume(v);
                    setMute(v === 0);
                  }}
                />
                <button
                  type="button"
                  className={styles.icon}
                  onClick={fullscreen}
                  aria-label="Full screen"
                >
                  <IconExpand size={20} />
                </button>
              </div>
            </div>
          </div>
        ) : !playing && time === 0 ? (
          <button
            type="button"
            className={`${styles.posterPlay} glass`}
            onClick={toggle}
            aria-label={`Play ${film.title}`}
          >
            <IconPlay size={30} />
          </button>
        ) : null}
      </div>

      {variant === "inline" ? (
        <div className={styles.bar}>
          <button
            type="button"
            className={styles.barPlay}
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
          </button>
          <span className={styles.clockSmall}>
            {formatClock(time)} <span>/ {formatClock(duration)}</span>
          </span>
          <Seek
            time={time}
            duration={duration}
            buffered={buffered}
            onSeek={(t) => {
              if (video.current) video.current.currentTime = t;
            }}
          />
          <button
            type="button"
            className={styles.icon}
            onClick={() => setMute(!muted)}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            <IconVolume size={20} muted={muted} />
          </button>
          {exitHref ? (
            <Link
              href={exitHref}
              className={styles.icon}
              aria-label="Open full-screen player"
            >
              <IconExpand size={20} />
            </Link>
          ) : null}
        </div>
      ) : null}
      <span className="visually-hidden" aria-live="polite">
        {pct >= 99.5 ? "Film finished." : ""}
      </span>
    </div>
  );
}

function Seek({
  time,
  duration,
  buffered,
  onSeek,
  big,
}: {
  time: number;
  duration: number;
  buffered: number;
  onSeek: (t: number) => void;
  big?: boolean;
}) {
  const max = Math.max(duration, 0.1);
  const pct = Math.min(100, (time / max) * 100);
  const buf = Math.min(100, (buffered / max) * 100);
  return (
    <div className={`${styles.seek} ${big ? styles.seekBig : ""}`}>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.buffer} style={{ width: `${buf}%` }} />
        <span className={styles.fill} style={{ width: `${pct}%` }} />
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={Math.min(time, max)}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="Seek"
        aria-valuetext={`${formatClock(time)} of ${formatClock(duration)}`}
        className={styles.range}
      />
    </div>
  );
}

function VolumeControls({
  muted,
  volume,
  onMute,
  onVolume,
}: {
  muted: boolean;
  volume: number;
  onMute: (m: boolean) => void;
  onVolume: (v: number) => void;
}) {
  return (
    <span className={styles.volume}>
      <button
        type="button"
        className={styles.icon}
        onClick={() => onMute(!muted)}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        <IconVolume size={20} muted={muted} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(e) => onVolume(Number(e.target.value))}
        aria-label="Volume"
        className={styles.volumeRange}
      />
    </span>
  );
}
