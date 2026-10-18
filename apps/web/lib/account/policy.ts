export const deletionConfirmation = "DELETE MY ACCOUNT";
export const recentSignInMs = 10 * 60 * 1000;

/** Session creation time comes from Clerk's verified Backend API, never JWT iat. */
export function isRecentSession(createdAt: number, now = Date.now()) {
  return (
    Number.isFinite(createdAt) &&
    createdAt <= now &&
    now - createdAt <= recentSignInMs
  );
}

export function hasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    return (
      new URL(origin).origin === new URL(request.url).origin &&
      origin === new URL(origin).origin &&
      !["cross-site", "none"].includes(
        request.headers.get("sec-fetch-site") ?? "",
      )
    );
  } catch {
    return false;
  }
}

/** Bound bytes while streaming: Content-Length is untrusted and may be absent. */
export async function readBoundedBody(request: Request, maxBytes: number) {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes))
    throw new Error("Invalid body size");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Body exceeds limit");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function validDeletionBody(body: unknown) {
  return (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Object.keys(body).length === 1 &&
    "confirmation" in body &&
    body.confirmation === deletionConfirmation
  );
}
