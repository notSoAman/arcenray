"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserApi } from "../../../../lib/client-api";
import styles from "./profile.module.css";

/** Accept or decline a pending credit. Only the credited person can attest. */
export function CreditResponse({ creditId }: { creditId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function respond(accept: boolean) {
    setState("busy");
    const { error } = await browserApi().credits.respond(creditId, accept);
    if (error) {
      setState("error");
      return;
    }
    router.refresh();
  }

  return (
    <span className={styles.creditActions}>
      <button
        type="button"
        className="pill"
        onClick={() => respond(true)}
        disabled={state === "busy"}
      >
        Confirm
      </button>
      <button
        type="button"
        className="pill"
        onClick={() => respond(false)}
        disabled={state === "busy"}
      >
        Not me
      </button>
      {state === "error" ? (
        <span className="field-error" role="alert">
          Couldn&apos;t update. Try again.
        </span>
      ) : null}
    </span>
  );
}

/** Block / unblock. Blocking hides and stops conversations between you. */
export function BlockButton({
  profileId,
  blocked,
}: {
  profileId: string;
  blocked: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function apply() {
    setState("busy");
    const api = browserApi();
    const userId = await api.viewer.id();
    if (!userId) {
      router.push(
        `/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
      setState("idle");
      return;
    }
    const { error } = blocked
      ? await api.supabase
          .from("user_blocks")
          .delete()
          .eq("blocker_id", userId)
          .eq("blocked_id", profileId)
      : await api.supabase
          .from("user_blocks")
          .insert({ blocker_id: userId, blocked_id: profileId });
    if (error && error.code !== "23505") return setState("error");
    setConfirming(false);
    setState("idle");
    router.refresh();
  }

  if (blocked)
    return (
      <button
        type="button"
        className="btn btn-ghost"
        onClick={apply}
        disabled={state === "busy"}
      >
        {state === "error" ? "Try again" : "Unblock"}
      </button>
    );

  return confirming ? (
    <span
      className={styles.blockConfirm}
      role="group"
      aria-label="Confirm block"
    >
      <span>Block them? They won&apos;t be able to message you.</span>
      <button
        type="button"
        className="pill"
        onClick={apply}
        disabled={state === "busy"}
      >
        {state === "error" ? "Try again" : "Block"}
      </button>
      <button
        type="button"
        className="pill"
        onClick={() => setConfirming(false)}
      >
        Cancel
      </button>
    </span>
  ) : (
    <button
      type="button"
      className={styles.quiet}
      onClick={async () => {
        if (!(await browserApi().viewer.id())) {
          router.push(
            `/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
          );
          return;
        }
        setConfirming(true);
      }}
    >
      Block
    </button>
  );
}
