"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserApi } from "../../../../lib/client-api";
import styles from "./reports.module.css";

type Command =
  | "open"
  | "reviewed"
  | "resolved"
  | "hide-film"
  | "restore-film"
  | "suspend-profile"
  | "reactivate-profile";
const labels: Record<Command, string> = {
  open: "Reopen report",
  reviewed: "Mark reviewed",
  resolved: "Resolve report",
  "hide-film": "Hide film",
  "restore-film": "Queue film restoration",
  "suspend-profile": "Suspend profile",
  "reactivate-profile": "Reactivate profile",
};

export function ReportControls({
  report,
}: {
  report: {
    id: string;
    status: string;
    film_id: string | null;
    profile_id: string | null;
  };
}) {
  const router = useRouter();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<Command | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const valid = reason.trim().length >= 3 && reason.trim().length <= 1000;
  function prepare(command: Command) {
    if (lock.current) return;
    setError("");
    setNotice("");
    if (!valid) {
      setError("Enter a decision reason between 3 and 1,000 characters.");
      return;
    }
    setPending(command);
  }
  async function apply() {
    if (lock.current || !pending || !valid) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const api = browserApi();
      let result;
      if (pending === "hide-film" || pending === "restore-film") {
        if (!report.film_id) throw new Error("Film target is unavailable.");
        result = await api.supabase.rpc("moderate_film", {
          p_film: report.film_id,
          p_hidden: pending === "hide-film",
          p_reason: reason.trim(),
        });
      } else if (
        pending === "suspend-profile" ||
        pending === "reactivate-profile"
      ) {
        if (!report.profile_id)
          throw new Error("Profile target is unavailable.");
        result = await api.supabase.rpc("moderate_profile", {
          p_profile: report.profile_id,
          p_suspended: pending === "suspend-profile",
          p_reason: reason.trim(),
        });
      } else {
        result = await api.supabase.rpc("moderate_report", {
          p_report: report.id,
          p_status: pending,
          p_reason: reason.trim(),
        });
      }
      if (result.error) throw result.error;
      setNotice(
        pending === "restore-film"
          ? "Restoration queued. Playback remains unavailable until media is ready."
          : `${labels[pending]}: request recorded.`,
      );
      setPending(null);
      setReason("");
      router.refresh();
    } catch {
      setError(
        "The action could not be confirmed. Reload to check its current state before retrying.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const commands: Command[] = [
    "open",
    "reviewed",
    "resolved",
    ...(report.film_id ? (["hide-film", "restore-film"] as const) : []),
    ...(report.profile_id
      ? (["suspend-profile", "reactivate-profile"] as const)
      : []),
  ];
  return (
    <section
      className={styles.controls}
      aria-label="Report actions"
      aria-busy={busy}
    >
      <label htmlFor={reasonId}>Decision reason</label>
      <textarea
        id={reasonId}
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
          setPending(null);
        }}
        minLength={3}
        maxLength={1000}
        disabled={busy}
        rows={3}
        placeholder="Record the finding and the reason for this action."
      />
      <p className={styles.muted}>
        {reason.trim().length} / 1,000 characters. A reason is required; content
        actions do not automatically resolve the report.
      </p>
      <div className={styles.actions}>
        {commands.map((command) => (
          <button
            key={command}
            type="button"
            className="btn btn-ghost"
            disabled={busy || !valid || command === report.status}
            onClick={() => prepare(command)}
          >
            {labels[command]}
          </button>
        ))}
      </div>
      {pending ? (
        <div
          className={styles.confirm}
          role="group"
          aria-label="Confirm moderation action"
        >
          <strong>{labels[pending]}?</strong>
          <p>
            {pending === "hide-film"
              ? "This removes public access and can affect films sharing these exact assets."
              : pending === "restore-film"
                ? "This queues restoration rather than immediately restoring playback."
                : pending === "suspend-profile"
                  ? "This restricts this account and its public content."
                  : "This decision and your reason will be recorded."}
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-accent"
              disabled={busy}
              onClick={() => void apply()}
            >
              {busy ? "Applying…" : "Confirm action"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}{" "}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => router.refresh()}
          >
            Reload reports
          </button>
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
