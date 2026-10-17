"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserApi } from "../lib/client-api";

/** Opens (or reuses) the one-to-one conversation with a person, then goes there. */
export function MessageButton({
  userId,
  className,
  children = "Message",
}: {
  userId: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "opening" | "error">("idle");

  async function open() {
    setState("opening");
    try {
      if (!(await browserApi().viewer.id())) {
        router.push(
          `/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
        );
        setState("idle");
        return;
      }
      const { data, error } = await browserApi().chat.open(userId);
      if (error || !data) {
        setState("error");
        return;
      }
      router.push(`/chats/${data}`);
    } catch {
      setState("error");
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={open}
      disabled={state === "opening"}
      aria-describedby={state === "error" ? `msg-error-${userId}` : undefined}
    >
      {state === "opening"
        ? "Opening…"
        : state === "error"
          ? "Try again"
          : children}
      {state === "error" ? (
        <span id={`msg-error-${userId}`} className="visually-hidden">
          Couldn&apos;t open the conversation. They may not accept messages.
        </span>
      ) : null}
    </button>
  );
}
