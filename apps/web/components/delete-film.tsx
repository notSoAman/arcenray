"use client";
import { useRef, useState } from "react";
import { browserApi } from "../lib/client-api";
import styles from "./delete-film.module.css";

/** RLS-backed owner RPC performs removal and safe asset cleanup transactionally. */
export function DeleteFilm({
  filmId,
  title,
  disabled = false,
  onBusyChange,
}: {
  filmId: string;
  title: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState("");
  const [removed, setRemoved] = useState(false);
  async function remove() {
    if (running.current || disabled || confirmation !== "DELETE FILM") return;
    running.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const result = await browserApi().supabase.rpc("delete_my_film", {
        p_film: filmId,
        p_confirmation: confirmation,
      });
      if (result.error)
        throw new Error(
          "Removal could not be confirmed. An upload or media operation may still be running. Check your profile before retrying; if the film remains, try again after that operation finishes.",
        );
      setRemoved(true);
      window.location.assign("/publish");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Removal could not be confirmed. Check your profile before retrying.",
      );
    } finally {
      running.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <section className={styles.panel} aria-label="Remove film">
      <h2>Remove this film</h2>
      <p>
        This permanently removes this film’s page, metadata and credits.
        Unreferenced media belonging to you is queued for background deletion.
        Files still used by your other films are retained.
      </p>
      {removed ? (
        <p role="status">
          Film removed. Eligible media cleanup is queued. Returning to your
          creator studio…
        </p>
      ) : open ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void remove();
          }}
        >
          <p>
            You are removing <strong>{title}</strong>. This cannot be undone.
          </p>
          <label className={styles.field}>
            Type <strong>DELETE FILM</strong> to confirm
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={disabled || busy}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className={styles.actions}>
            <button
              className="btn btn-accent"
              type="submit"
              disabled={disabled || busy || confirmation !== "DELETE FILM"}
            >
              {busy ? "Removing…" : "Permanently remove film"}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={disabled || busy}
              onClick={() => {
                setOpen(false);
                setConfirmation("");
                setError("");
              }}
            >
              Keep film
            </button>
          </div>
        </form>
      ) : (
        <button
          className="btn btn-ghost"
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          Remove film…
        </button>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
