"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { openCollaboratorConversation } from "@repo/shared";
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
  const lock = useRef(false);

  async function open() {
    if (lock.current) return;
    lock.current = true;
    setState("opening");
    try {
      const result = await openCollaboratorConversation(browserApi(), userId);
      if (result.status === "sign-in") {
        router.push(
          `/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
        );
        setState("idle");
        return;
      }
      router.push(`/chats/${result.conversationId}`);
    } catch {
      setState("error");
    } finally {
      lock.current = false;
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={open}
        disabled={state === "opening"}
        aria-busy={state === "opening"}
        aria-describedby={state === "error" ? `msg-error-${userId}` : undefined}
      >
        {state === "opening"
          ? "Opening…"
          : state === "error"
            ? "Try again"
            : children}
      </button>
      {state === "error" ? (
        <span id={`msg-error-${userId}`} role="alert">
          Couldn&apos;t open the conversation. Check your connection and try
          again.
        </span>
      ) : null}
    </>
  );
}
