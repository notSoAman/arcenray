"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "../lib/supabase/client";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    const { error } = await createClient().auth.signOut();
    if (error) {
      setPending(false);
      setFailed(true);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      className={className}
      onClick={signOut}
      disabled={pending}
      aria-describedby={failed ? "sign-out-error" : undefined}
    >
      {pending ? "Signing out…" : failed ? "Try signing out again" : "Sign out"}
      {failed ? (
        <span id="sign-out-error" className="visually-hidden">
          Sign out failed. Check your connection.
        </span>
      ) : null}
    </button>
  );
}
