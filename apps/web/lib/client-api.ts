"use client";

import { createArcenrayClient } from "@repo/shared";
import { createClient } from "./supabase/client";

let cached: ReturnType<typeof createArcenrayClient> | null = null;

/** Browser SDK bound to the signed-in session. RLS stays the authority. */
export function browserApi() {
  cached ??= createArcenrayClient(createClient());
  return cached;
}

export function newId() {
  return crypto.randomUUID();
}

/**
 * Record a meaningful, deduplicated taste signal. Failures are swallowed on purpose:
 * events must never block what the person is doing.
 */
export function recordEvent(
  filmId: string,
  kind: "hook_watch" | "film_complete" | "like" | "bookmark" | "skip",
  watchSeconds = 0,
  idempotencyKey = newId(),
) {
  void Promise.resolve(
    browserApi().events.record({
      film_id: filmId,
      kind,
      idempotency_key: idempotencyKey,
      watch_seconds: Math.max(0, Math.round(watchSeconds)),
    }),
  ).catch(() => undefined);
}
