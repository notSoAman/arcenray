"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { browserApi } from "../lib/client-api";
import styles from "./film-credits.module.css";

type Invitation = {
  credit_id: string;
  film_id: string;
  film_title: string;
  film_status: string;
  role: string;
  owner_handle: string;
  owner_name: string;
  invited_at: string;
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
    const { data, error } = await browserApi().credits.invitations();
    if (error) throw error;
    return data ?? [];
  }, []);
  const reload = useCallback(async () => setInvitations(await load()), [load]);
  useEffect(() => {
    let active = true;
    void load()
      .then((data) => {
        if (active) setInvitations(data);
      })
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
      await reload();
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
      key={viewerId}
      aria-busy={loading || !!busy}
    >
      <h2>Credit invitations</h2>
      <p className={styles.muted}>
        Accept only work you contributed to. Draft films become visible when
        published. Declining does not remove the filmmaker’s credit entry.
      </p>
      {loading ? (
        <p role="status">Loading invitations…</p>
      ) : invitations.length ? (
        <ul className={styles.list}>
          {invitations.map((credit) => (
            <li key={credit.credit_id}>
              <div>
                {credit.film_status === "published" ? (
                  <Link href={`/films/${credit.film_id}`}>
                    {credit.film_title}
                  </Link>
                ) : (
                  <strong>{credit.film_title} · Draft</strong>
                )}
                <span>{credit.role}</span>
                <span>
                  Invited by{" "}
                  <Link href={`/u/${credit.owner_handle}`}>
                    {credit.owner_name} (@{credit.owner_handle})
                  </Link>
                </span>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!!busy}
                  onClick={() => void respond(credit.credit_id, true)}
                  aria-label={`Accept ${credit.role} credit for ${credit.film_title}`}
                >
                  {busy === credit.credit_id ? "Saving…" : "Accept credit"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!!busy}
                  onClick={() => void respond(credit.credit_id, false)}
                  aria-label={`Decline ${credit.role} credit for ${credit.film_title}`}
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
              void reload()
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
