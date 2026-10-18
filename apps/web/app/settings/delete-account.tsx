"use client";
import { useState } from "react";
import Link from "next/link";
import { deletionConfirmation } from "../../lib/account/policy";
import { SignOutButton } from "../../components/sign-out-button";
import styles from "./settings.module.css";

export function DeleteAccount({ configured }: { configured: boolean }) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recentRequired, setRecentRequired] = useState(false);
  async function remove() {
    setBusy(true);
    setError("");
    try {
      const result = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ confirmation }),
      });
      const data: unknown = await result.json();
      if (!result.ok) {
        if (
          data &&
          typeof data === "object" &&
          "code" in data &&
          data.code === "recent_sign_in_required"
        )
          setRecentRequired(true);
        throw new Error(
          data &&
            typeof data === "object" &&
            "error" in data &&
            typeof data.error === "string"
            ? data.error
            : "Deletion could not start. Please retry.",
        );
      }
      window.location.assign("/account-deleted");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Deletion could not start. Please retry.",
      );
      setBusy(false);
    }
  }
  return (
    <section className={styles.panel}>
      <h2>Delete your account</h2>
      <p>
        This permanently removes your Arcenray profile, films, uploaded media
        and private account data. It also deletes your Clerk login. Published
        work becomes unavailable when the request starts; storage cleanup runs
        in the background.
      </p>
      <p>
        Messages and credits linked to other people may be removed or anonymized
        as part of cleanup. This cannot be undone. Download any work you want to
        keep first.
      </p>
      <p>
        For safety, sign out and sign in again before requesting deletion. The
        server requires a session created within the last 10 minutes.
      </p>
      {!configured ? (
        <p role="status">
          Self-service deletion is not configured in this environment.{" "}
          <Link href="/settings/support">See support options</Link> before
          continuing.
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void remove();
          }}
        >
          <label className={styles.field}>
            Type <strong>{deletionConfirmation}</strong> to confirm
            <input
              autoComplete="off"
              spellCheck={false}
              value={confirmation}
              disabled={busy}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          <button
            className="btn btn-accent"
            type="submit"
            disabled={busy || confirmation !== deletionConfirmation}
          >
            {busy ? "Requesting deletion…" : "Permanently delete account"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {recentRequired && (
        <div className={styles.actions}>
          <SignOutButton className="btn btn-ghost" />
        </div>
      )}
    </section>
  );
}
