"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { browserApi } from "../lib/client-api";
import styles from "./film-credits.module.css";

type Invitation = {
  id: string;
  role: string;
  films: { id: string; title: string; owner_id: string };
};

/** Include on the signed-in person's own profile or account page only. */
export function CreditInvitations({ viewerId }: { viewerId: string }) {
  const router = useRouter();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const load = useCallback(async () => {
    const { data, error } = await browserApi()
      .supabase.from("film_credits")
      .select("id,role,films!inner(id,title,owner_id)")
      .eq("profile_id", viewerId)
      .eq("verification_state", "pending")
      .eq("films.status", "published")
      .neq("films.owner_id", viewerId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    setInvitations(data ?? []);
  }, [viewerId]);
  useEffect(() => {
    let active = true;
    void load()
      .catch(() => {
        if (active) setError("Couldn’t load credit invitations.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  async function respond(id: string, accept: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const { error } = await browserApi().credits.respond(id, accept);
      if (error) throw error;
      await load();
      setNotice(accept ? "Credit confirmed." : "Credit declined.");
      router.refresh();
    } catch {
      setError("Couldn’t update your credit. Reload and try again.");
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }
  return (
    <section
      className={styles.panel}
      aria-label="Credit invitations"
      aria-busy={loading || !!busy}
    >
      <h2>Credit invitations</h2>
      <p className={styles.muted}>
        Confirm only work you contributed to. Declining does not remove the
        filmmaker’s credit entry.
      </p>
      {loading ? (
        <p role="status">Loading invitations…</p>
      ) : invitations.length ? (
        <ul className={styles.list}>
          {invitations.map((credit) => (
            <li key={credit.id}>
              <div>
                <Link href={`/watch/${credit.films.id}`}>
                  {credit.films.title}
                </Link>
                <span>{credit.role}</span>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!!busy}
                  onClick={() => void respond(credit.id, true)}
                  aria-label={`Confirm ${credit.role} credit for ${credit.films.title}`}
                >
                  {busy === credit.id ? "Saving…" : "Confirm credit"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!!busy}
                  onClick={() => void respond(credit.id, false)}
                  aria-label={`Decline ${credit.role} credit for ${credit.films.title}`}
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No pending credit invitations.</p>
      )}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? (
        <div role="alert" className={styles.error}>
          {error}{" "}
          <button
            type="button"
            disabled={!!busy}
            onClick={() => {
              setError("");
              setLoading(true);
              void load()
                .catch(() => setError("Couldn’t load credit invitations."))
                .finally(() => setLoading(false));
            }}
          >
            Reload invitations
          </button>
        </div>
      ) : null}
    </section>
  );
}
