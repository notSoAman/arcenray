"use client";
import { useClerk } from "@clerk/nextjs";
import { useState } from "react";
export function SignOutButton({ className }: { className?: string }) {
  const { signOut } = useClerk();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  return (
    <button
      type="button"
      className={className}
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        try {
          await signOut({ redirectUrl: "/home" });
        } catch {
          setState("error");
        }
      }}
    >
      {state === "busy"
        ? "Signing out…"
        : state === "error"
          ? "Try signing out again"
          : "Sign out"}
    </button>
  );
}
