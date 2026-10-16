"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createClient } from "../../lib/supabase/client";
import styles from "./sign-in.module.css";

const RESEND_SECONDS = 60;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

/** Map Supabase Auth failures to honest, actionable copy. Never claims success. */
function describeAuthError(error: {
  status?: number;
  code?: string;
  message: string;
}) {
  if (typeof navigator !== "undefined" && !navigator.onLine)
    return "You seem to be offline. Reconnect and try again.";
  if (error.status === 429 || error.code === "over_email_send_rate_limit")
    return "Too many sign-in emails were requested. Wait a minute, then try again.";
  if (/sending|smtp|email/i.test(error.message) && (error.status ?? 0) >= 500)
    return "We couldn't send the email right now. Email delivery for arcenray is still being set up, so this can fail — please try again later.";
  if (error.code === "email_address_invalid" || error.status === 400)
    return "That email address wasn't accepted. Check it and try again.";
  return "Something went wrong sending your link. Please try again.";
}

export function SignInForm({ linkError }: { linkError: string | null }) {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [cooldown, setCooldown] = useState(0);
  const inputId = useId();
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function send(address: string) {
    setStatus({ kind: "sending" });
    try {
      const { error } = await createClient().auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setStatus({ kind: "error", message: describeAuthError(error) });
      } else {
        setStatus({ kind: "sent", email: address });
        setCooldown(RESEND_SECONDS);
      }
    } catch {
      setStatus({
        kind: "error",
        message:
          "We couldn't reach arcenray. Check your connection and try again.",
      });
    }
    statusRef.current?.focus();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (!emailPattern.test(address)) {
      setFieldError("Enter an email address like you@example.com.");
      return;
    }
    setFieldError(null);
    void send(address);
  }

  if (status.kind === "sent") {
    return (
      <div className={styles.sent} ref={statusRef} tabIndex={-1} role="status">
        <div className={styles.sentIcon} aria-hidden="true">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
          </svg>
        </div>
        <h2 className={styles.sentTitle}>Check your inbox</h2>
        <p className={styles.sentText}>
          We sent a sign-in link to <strong>{status.email}</strong>. Open it in
          this browser to continue. It works once and expires soon.
        </p>
        <p className={styles.sentText}>
          Nothing there? Check spam or promotions.
        </p>
        <div className={styles.sentActions}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void send(status.email)}
            disabled={cooldown > 0}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend link"}
          </button>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => setStatus({ kind: "idle" })}
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  const sending = status.kind === "sending";
  const errorId = `${inputId}-error`;
  return (
    <div className={styles.formStack}>
      {linkError && status.kind === "idle" ? (
        <div className="notice notice-error" role="alert">
          {linkError}
        </div>
      ) : null}
      <div ref={statusRef} tabIndex={-1} aria-live="assertive">
        {status.kind === "error" ? (
          <div className="notice notice-error" role="alert">
            {status.message}
          </div>
        ) : null}
      </div>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <div className="field">
          <label className="field-label" htmlFor={inputId}>
            Email
          </label>
          <input
            id={inputId}
            className="input"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? errorId : undefined}
            disabled={sending}
            required
          />
          {fieldError ? (
            <span id={errorId} className="field-error">
              {fieldError}
            </span>
          ) : null}
        </div>
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={sending}
        >
          {sending ? "Sending your link…" : "Email me a sign-in link"}
        </button>
      </form>

      <div className={styles.divider}>
        <span>or</span>
      </div>

      {/* Google OAuth is not configured by the founder yet; shown honestly as unavailable. */}
      <div className={styles.oauth}>
        <button
          type="button"
          className="btn btn-ghost btn-block"
          disabled
          aria-describedby="google-unavailable"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M21.6 12.23c0-.68-.06-1.36-.18-2.02H12v3.83h5.4a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.96-4.32 2.96-7.33z" />
            <path
              d="M12 22c2.7 0 4.98-.9 6.64-2.43l-3.24-2.5c-.9.6-2.05.95-3.4.95-2.6 0-4.81-1.76-5.6-4.12H3.06v2.58A10 10 0 0 0 12 22z"
              opacity=".75"
            />
            <path
              d="M6.4 13.9a6 6 0 0 1 0-3.8V7.52H3.06a10 10 0 0 0 0 8.96L6.4 13.9z"
              opacity=".5"
            />
            <path
              d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2 10 10 0 0 0 3.06 7.52L6.4 10.1C7.19 7.74 9.4 5.98 12 5.98z"
              opacity=".85"
            />
          </svg>
          Continue with Google
        </button>
        <span id="google-unavailable" className="field-hint">
          Google sign-in isn&apos;t available yet. Use your email for now.
        </span>
      </div>
    </div>
  );
}
