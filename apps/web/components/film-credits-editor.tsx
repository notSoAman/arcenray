"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserApi } from "../lib/client-api";
import styles from "./film-credits.module.css";

type Credit = {
  id: string;
  display_name: string;
  role: string;
  profile_id: string | null;
  verification_state: string;
};

/** Mount with key={filmId} when switching drafts. RLS enforces ownership. */
export function FilmCreditsEditor({
  filmId,
  viewerId,
  editable = false,
}: {
  filmId: string;
  viewerId: string;
  editable?: boolean;
}) {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const load = useCallback(async () => {
    const { data, error } = await browserApi()
      .supabase.from("film_credits")
      .select("id,display_name,role,profile_id,verification_state")
      .eq("film_id", filmId)
      .order("created_at");
    if (error) throw error;
    setCredits(data ?? []);
  }, [filmId]);
  useEffect(() => {
    let active = true;
    void load()
      .catch(() => {
        if (active) setError("Couldn’t load credits. Try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  async function add() {
    if (lock.current || !editable || loading) return;
    const displayName = name.trim();
    const creditRole = role.trim();
    if (!displayName || !creditRole) {
      setError("Enter the person’s name and role.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      let profileId: string | null = null;
      const exactHandle = handle.trim().replace(/^@/, "").toLowerCase();
      if (exactHandle) {
        const { data, error } = await browserApi()
          .supabase.from("profiles")
          .select("id")
          .eq("handle", exactHandle)
          .eq("onboarding_completed", true)
          .maybeSingle();
        if (error) throw error;
        if (!data)
          throw new Error(
            "No public profile has that handle. Check it or leave the handle empty.",
          );
        profileId = data.id;
      }
      if (
        credits.some(
          (credit) =>
            credit.role.toLowerCase() === creditRole.toLowerCase() &&
            (profileId
              ? credit.profile_id === profileId
              : !credit.profile_id &&
                credit.display_name.toLowerCase() ===
                  displayName.toLowerCase()),
        )
      ) {
        throw new Error("That person already has this role in the credits.");
      }
      const { error } = await browserApi()
        .supabase.from("film_credits")
        .insert({
          film_id: filmId,
          profile_id: profileId,
          display_name: displayName,
          role: creditRole,
        });
      if (error)
        throw new Error(
          "Couldn’t add this credit. Check the details and try again.",
        );
      await load();
      setName("");
      setRole("");
      setHandle("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn’t save credits. Try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (lock.current || !editable) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const { data, error } = await browserApi()
        .supabase.from("film_credits")
        .delete()
        .eq("id", id)
        .eq("film_id", filmId)
        .eq("verification_state", "pending")
        .select("id");
      if (error || !data?.length)
        throw new Error("Couldn’t remove this credit. Reload and try again.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn’t remove credit.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      className={styles.panel}
      aria-label="Film credits"
      aria-busy={busy || loading}
    >
      <h2>Film credits</h2>
      <p className={styles.muted}>
        Credit your collaborators. Registered creatives can confirm their credit
        after publication. Your own credits remain unverified.
      </p>
      {loading ? (
        <p role="status">Loading credits…</p>
      ) : credits.length ? (
        <ul className={styles.list}>
          {credits.map((credit) => (
            <li key={credit.id}>
              <div>
                <strong>{credit.display_name}</strong>
                <span>
                  {credit.role} ·{" "}
                  {credit.verification_state === "accepted"
                    ? "Confirmed by creative"
                    : credit.verification_state === "declined"
                      ? "Declined"
                      : credit.profile_id === viewerId
                        ? "Unverified self-credit"
                        : credit.profile_id
                          ? "Awaiting confirmation"
                          : "Unverified"}
                </span>
              </div>
              {editable && credit.verification_state === "pending" ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => void remove(credit.id)}
                  aria-label={`Remove ${credit.display_name}, ${credit.role}`}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No credits added yet.</p>
      )}
      {editable ? (
        <div className={styles.fields}>
          <label>
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              disabled={busy}
              autoComplete="off"
            />
          </label>
          <label>
            Role
            <input
              value={role}
              onChange={(event) => setRole(event.target.value)}
              maxLength={80}
              disabled={busy}
              placeholder="e.g. Cinematographer"
            />
          </label>
          <label>
            Arcenray handle (optional)
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              maxLength={64}
              disabled={busy}
              autoCapitalize="none"
              placeholder="@handle"
            />
          </label>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || loading || !name.trim() || !role.trim()}
            onClick={() => void add()}
          >
            {busy ? "Saving…" : "Add credit"}
          </button>
        </div>
      ) : null}
      {error ? (
        <div role="alert" className={styles.error}>
          {error}{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError("");
              setLoading(true);
              void load()
                .catch(() => setError("Couldn’t load credits. Try again."))
                .finally(() => setLoading(false));
            }}
          >
            Reload credits
          </button>
        </div>
      ) : null}
    </section>
  );
}
