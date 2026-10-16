import { putBlob } from "./transport.ts";
import { validateUpload, type MediaKind } from "./validation.ts";

type Reply = { data: unknown; error: unknown };
/** Compatible with createArcenrayClient(supabase).media. */
export type MediaApi = {
  create(input: {
    kind: MediaKind;
    bytes: number;
    content_type: "video/mp4" | "image/webp";
  }): PromiseLike<Reply>;
  complete(id: string): PromiseLike<Reply>;
};
export type UploadReceipt = {
  asset_id: string;
  status: "uploaded" | "ready";
  public_key: string | null;
};
export type UploadState = {
  stage:
    | "idle"
    | "reserving"
    | "uploading"
    | "verifying"
    | "complete"
    | "cancelled"
    | "error";
  bytesSent: number;
  totalBytes: number;
  assetId?: string;
  error?: string;
};
type Intent = {
  asset_id: string;
  upload_url: string;
  expires_at: string;
  headers: Record<string, string>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object")
    throw new Error("Invalid media service response");
  return value as Record<string, unknown>;
}
function readIntent(value: unknown, blob: Blob): Intent {
  const data = object(value);
  const headers = object(data.headers);
  const url = new URL(String(data.upload_url));
  if (
    typeof data.asset_id !== "string" ||
    !uuid.test(data.asset_id) ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.hostname.endsWith(".r2.cloudflarestorage.com") ||
    typeof data.expires_at !== "string" ||
    !Number.isFinite(Date.parse(data.expires_at)) ||
    headers["Content-Type"] !== blob.type
  )
    throw new Error("Invalid upload reservation");
  return {
    asset_id: data.asset_id,
    upload_url: url.href,
    expires_at: data.expires_at,
    headers: { "Content-Type": blob.type },
  };
}

/** Keep one task per selected Blob. Retry reuses its reservation and completed PUT. */
export function createUploadTask(
  kind: MediaKind,
  blob: Blob,
  api: MediaApi,
  onChange?: (state: Readonly<UploadState>) => void,
) {
  validateUpload(kind, blob);
  let state: UploadState = {
    stage: "idle",
    bytesSent: 0,
    totalBytes: blob.size,
  };
  let intent: Intent | undefined;
  let transferred = false;
  let result: UploadReceipt | undefined;
  let controller: AbortController | undefined;
  const emit = (patch: Partial<UploadState>) => {
    state = { ...state, ...patch };
    try {
      onChange?.({ ...state });
    } catch {
      /* Observer errors cannot interrupt uploads. */
    }
  };
  return {
    get state(): Readonly<UploadState> {
      return { ...state };
    },
    cancel() {
      controller?.abort();
    },
    async start(): Promise<UploadReceipt> {
      if (controller) throw new Error("Upload is already running");
      if (result) return result;
      controller = new AbortController();
      const { signal } = controller;
      try {
        emit({ error: undefined });
        if (!intent || Date.parse(intent.expires_at) <= Date.now() + 5000) {
          transferred = false;
          emit({ stage: "reserving", bytesSent: 0, assetId: undefined });
          const reply = await api.create({
            kind,
            bytes: blob.size,
            content_type: blob.type as "video/mp4" | "image/webp",
          });
          if (reply.error)
            throw new Error(
              "Could not reserve upload. Check your session and available storage.",
            );
          intent = readIntent(reply.data, blob);
          emit({ assetId: intent.asset_id });
        }
        signal.throwIfAborted();
        if (!transferred) {
          emit({ stage: "uploading", bytesSent: 0 });
          await putBlob(
            intent.upload_url,
            intent.headers,
            blob,
            signal,
            (bytesSent) => emit({ bytesSent }),
          );
          transferred = true;
          emit({ bytesSent: blob.size });
        }
        signal.throwIfAborted();
        emit({ stage: "verifying" });
        const reply = await api.complete(intent.asset_id);
        if (reply.error)
          throw new Error(
            "Upload sent, but verification failed. Retry verification; your draft is safe.",
          );
        const receipt = object(reply.data);
        if (
          receipt.asset_id !== intent.asset_id ||
          !["uploaded", "ready"].includes(String(receipt.status)) ||
          !(
            receipt.public_key === null ||
            typeof receipt.public_key === "string"
          )
        )
          throw new Error("Invalid media verification response");
        result = receipt as UploadReceipt;
        // Verification already committed server-side; report success even if cancelled while awaiting it.
        emit({ stage: "complete" });
        return result;
      } catch (error) {
        const cancelled =
          error instanceof DOMException && error.name === "AbortError";
        emit({
          stage: cancelled ? "cancelled" : "error",
          error: cancelled
            ? undefined
            : error instanceof Error
              ? error.message
              : "Upload failed",
        });
        throw error;
      } finally {
        controller = undefined;
      }
    },
  };
}
