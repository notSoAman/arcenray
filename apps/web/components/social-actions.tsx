"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { browserApi, recordEvent } from "../lib/client-api";
import {
  IconBookmark,
  IconCheck,
  IconFlag,
  IconHeart,
  IconShare,
} from "./icons";
import styles from "./social-actions.module.css";

async function currentUserId() {
  const { data } = await browserApi().supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Follow / Following toggle (profile_follows; own rows only). */
export function FollowButton({
  profileId,
  initial,
  className,
}: {
  profileId: string;
  initial: boolean;
  className?: string;
}) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    setBusy(true);
    setError(false);
    const me = await currentUserId();
    const db = browserApi().supabase;
    const res = !me
      ? { error: { code: "auth" } }
      : on
        ? await db
            .from("profile_follows")
            .delete()
            .eq("follower_id", me)
            .eq("following_id", profileId)
        : await db
            .from("profile_follows")
            .insert({ follower_id: me, following_id: profileId });
    setBusy(false);
    if (res.error && res.error.code !== "23505") {
      setError(true);
      return;
    }
    setOn(!on);
  }

  return (
    <button
      type="button"
      className={`${styles.follow} ${className ?? ""}`}
      aria-pressed={on}
      onClick={toggle}
      disabled={busy}
      title={error ? "Couldn't update. Try again." : undefined}
    >
      {error ? "Try again" : on ? "Following" : "Follow"}
    </button>
  );
}

/** Like + Save toggles for a film. Adding either sends a strong taste signal. */
export function FilmToggles({
  filmId,
  liked: initialLiked,
  saved: initialSaved,
}: {
  filmId: string;
  liked: boolean;
  saved: boolean;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [saved, setSaved] = useState(initialSaved);
  const [error, setError] = useState<string | null>(null);

  async function flip(table: "film_likes" | "film_bookmarks", on: boolean) {
    setError(null);
    const me = await currentUserId();
    if (!me) return false;
    const db = browserApi().supabase;
    const { error: e } = on
      ? await db.from(table).delete().eq("user_id", me).eq("film_id", filmId)
      : await db.from(table).insert({ user_id: me, film_id: filmId });
    if (e && e.code !== "23505") {
      setError("Couldn't save that. Check your connection and try again.");
      return false;
    }
    if (!on) recordEvent(filmId, table === "film_likes" ? "like" : "bookmark");
    return true;
  }

  return (
    <>
      <button
        type="button"
        className={styles.chip}
        aria-pressed={liked}
        onClick={async () => {
          if (await flip("film_likes", liked)) setLiked(!liked);
        }}
      >
        <IconHeart size={18} filled={liked} />
        {liked ? "Liked" : "Like"}
      </button>
      <button
        type="button"
        className={styles.chip}
        aria-pressed={saved}
        onClick={async () => {
          if (await flip("film_bookmarks", saved)) setSaved(!saved);
        }}
      >
        <IconBookmark size={18} filled={saved} />
        {saved ? "Saved" : "Save"}
      </button>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

/** Native share sheet where available, otherwise copy the link. */
export function ShareButton({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Share sheet dismissed. */
    }
  }
  return (
    <button type="button" className={styles.chip} onClick={share}>
      {copied ? <IconCheck size={18} /> : <IconShare size={18} />}
      {copied ? "Link copied" : "Share"}
      <span className="visually-hidden" aria-live="polite">
        {copied ? "Link copied to clipboard" : ""}
      </span>
    </button>
  );
}

/**
 * Report a film or profile (content_reports). The reporter only ever sees their
 * own reports; review is a founder/moderation operation.
 */
export function ReportButton({
  target,
  label = "Report",
}: {
  target: { film_id: string } | { profile_id: string };
  label?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (reason.trim().length < 3) return;
    setState("sending");
    const me = await currentUserId();
    if (!me) {
      setState("error");
      return;
    }
    const { error } = await browserApi()
      .supabase.from("content_reports")
      .insert({
        reporter_id: me,
        reason: reason.trim().slice(0, 1000),
        ...target,
      });
    setState(error ? "error" : "sent");
  }

  return (
    <>
      <button
        type="button"
        className={styles.quiet}
        onClick={() => {
          setState("idle");
          dialog.current?.showModal();
        }}
      >
        <IconFlag size={16} />
        {label}
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={`${id}-title`}
      >
        {state === "sent" ? (
          <div className={styles.dialogBody}>
            <h2 id={`${id}-title`}>Thanks — we&apos;ve got it.</h2>
            <p>
              Your report was sent for review. You won&apos;t be named to the
              person you reported.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => dialog.current?.close()}
            >
              Done
            </button>
          </div>
        ) : (
          <form className={styles.dialogBody} onSubmit={submit}>
            <h2 id={`${id}-title`}>What&apos;s wrong?</h2>
            <label className="field">
              <span className="field-label">Tell us briefly</span>
              <textarea
                className="input"
                value={reason}
                maxLength={1000}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. This uses my footage without permission"
                required
              />
            </label>
            {state === "error" ? (
              <p className="field-error" role="alert">
                Couldn&apos;t send the report. Try again.
              </p>
            ) : null}
            <div className={styles.dialogActions}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => dialog.current?.close()}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-accent"
                disabled={state === "sending" || reason.trim().length < 3}
              >
                {state === "sending" ? "Sending…" : "Send report"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
