import type {
  MultipartCheckpoint,
  MultipartCheckpointPort,
} from "./multipart-upload.ts";
import { MAX_FILM_BYTES } from "./validation.ts";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Owner/draft scoped hints only. The authenticated service remains authoritative. */
export function multipartCheckpoint(
  profileId: string,
  draftId: string,
): MultipartCheckpointPort {
  if (!uuid.test(profileId) || !uuid.test(draftId))
    throw new Error("Invalid checkpoint identity");
  const key = `arcenray:multipart:v1:${profileId}:${draftId}`;
  return {
    async read() {
      const text = localStorage.getItem(key);
      if (!text) return null;
      const value: unknown = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(
          "Saved upload checkpoint is unreadable. Review pending uploads before discarding it.",
        );
      const data = value as Record<string, unknown>;
      if (
        typeof data.request_id !== "string" ||
        !uuid.test(data.request_id) ||
        !(
          data.asset_id === null ||
          (typeof data.asset_id === "string" && uuid.test(data.asset_id))
        ) ||
        data.draft_id !== draftId ||
        typeof data.fingerprint !== "string" ||
        !/^[a-f0-9]{64}$/.test(data.fingerprint) ||
        typeof data.bytes !== "number" ||
        !Number.isSafeInteger(data.bytes) ||
        data.bytes <= 0 ||
        data.bytes > MAX_FILM_BYTES
      )
        throw new Error(
          "Saved upload checkpoint is unreadable. Review pending uploads before discarding it.",
        );
      return {
        request_id: data.request_id,
        asset_id: data.asset_id,
        draft_id: draftId,
        fingerprint: data.fingerprint,
        bytes: data.bytes,
      };
    },
    async write(value: MultipartCheckpoint) {
      if (value.draft_id !== draftId)
        throw new Error("Checkpoint belongs to another draft");
      const { request_id, asset_id, fingerprint, bytes } = value;
      localStorage.setItem(
        key,
        JSON.stringify({
          request_id,
          asset_id,
          draft_id: draftId,
          fingerprint,
          bytes,
        }),
      );
    },
    async clear() {
      localStorage.removeItem(key);
    },
  };
}
