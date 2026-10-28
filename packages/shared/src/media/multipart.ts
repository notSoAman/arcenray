import { validateUpload } from "./validation.ts";
export type UploadReceipt = {
  asset_id: string;
  status: "uploaded" | "ready";
  public_key: string | null;
};
export type UploadChunk = {
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
};
export type UploadSource = UploadChunk & {
  slice(start: number, end: number, type?: string): UploadChunk;
};
export type MultipartTransport = (
  url: string,
  headers: Record<string, string>,
  chunk: UploadChunk,
  signal: AbortSignal,
  onProgress: (bytes: number) => void,
) => Promise<void>;
export type Digest = (value: ArrayBuffer) => Promise<ArrayBuffer>;

export const MULTIPART_PART_SIZE = 64 * 1024 ** 2;
const FINGERPRINT_CHUNK_SIZE = 16 * 1024 ** 2;
type Reply = { data: unknown; error: unknown };
export type MultipartApi = {
  create(input: {
    draft_id: string;
    request_id: string;
    bytes: number;
    content_type: "video/mp4";
    fingerprint: string;
  }): PromiseLike<Reply>;
  list(draftId: string): PromiseLike<Reply>;
  status(assetId: string): PromiseLike<Reply>;
  sign(input: { asset_id: string; part_numbers: number[] }): PromiseLike<Reply>;
  finish(assetId: string): PromiseLike<Reply>;
  abort(assetId: string): PromiseLike<Reply>;
};
export type MultipartDescriptor = {
  asset_id: string;
  draft_id: string;
  bytes: number;
  fingerprint: string;
  part_size: number;
  part_count: number;
  resume_expires_at: string;
  status:
    | "initializing"
    | "uploading"
    | "completing"
    | "uploaded"
    | "ready"
    | "aborting"
    | "aborted"
    | "expired";
};
export type MultipartCheckpoint = {
  request_id: string;
  asset_id: string | null;
  draft_id: string;
  fingerprint: string;
  bytes: number;
};
/** Scope this port to the current application profile + draft. Never persist tokens, URLs or file bytes. */
export type MultipartCheckpointPort = {
  read(): Promise<MultipartCheckpoint | null>;
  write(checkpoint: MultipartCheckpoint): Promise<void>;
  clear(): Promise<void>;
};
export type MultipartState = {
  stage:
    | "idle"
    | "hashing"
    | "reserving"
    | "uploading"
    | "paused"
    | "verifying"
    | "complete"
    | "aborting"
    | "aborted"
    | "error";
  bytesSent: number;
  totalBytes: number;
  hashedBytes: number;
  assetId?: string;
  error?: string;
};
type Status = MultipartDescriptor & {
  parts: { part_number: number; bytes: number }[];
  receipt: UploadReceipt | null;
};
type SignedPart = {
  part_number: number;
  bytes: number;
  upload_url: string;
  headers: { "Content-Type": "video/mp4" };
  expires_at: string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = /^[a-f0-9]{64}$/;
const statuses = [
  "initializing",
  "uploading",
  "completing",
  "uploaded",
  "ready",
  "aborting",
  "aborted",
  "expired",
];
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid multipart service response");
  return value as Record<string, unknown>;
}
function date(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function receipt(value: unknown, asset: string): UploadReceipt {
  const data = object(value);
  if (
    data.asset_id !== asset ||
    (data.status !== "uploaded" && data.status !== "ready") ||
    !(data.public_key === null || typeof data.public_key === "string")
  )
    throw new Error("Invalid media verification response");
  return { asset_id: asset, status: data.status, public_key: data.public_key };
}
export function parseMultipartDescriptor(value: unknown): MultipartDescriptor {
  const data = object(value);
  if (
    typeof data.asset_id !== "string" ||
    !uuid.test(data.asset_id) ||
    typeof data.draft_id !== "string" ||
    !uuid.test(data.draft_id) ||
    typeof data.bytes !== "number" ||
    !Number.isSafeInteger(data.bytes) ||
    data.bytes <= 0 ||
    data.bytes > 5 * 1024 ** 4 ||
    typeof data.fingerprint !== "string" ||
    !hash.test(data.fingerprint) ||
    typeof data.part_size !== "number" ||
    !Number.isInteger(data.part_size) ||
    data.part_size < 16 * 1024 ** 2 ||
    data.part_size > 512 * 1024 ** 2 ||
    data.part_count !== Math.ceil(data.bytes / data.part_size) ||
    data.part_count > 10000 ||
    !date(data.resume_expires_at) ||
    typeof data.status !== "string" ||
    !statuses.includes(data.status)
  )
    throw new Error("Invalid multipart upload descriptor");
  return {
    asset_id: data.asset_id,
    draft_id: data.draft_id,
    bytes: data.bytes,
    fingerprint: data.fingerprint,
    part_size: data.part_size,
    part_count: data.part_count as number,
    resume_expires_at: data.resume_expires_at,
    status: data.status as MultipartDescriptor["status"],
  };
}
function partBytes(descriptor: MultipartDescriptor, number: number) {
  return Math.min(
    descriptor.part_size,
    descriptor.bytes - (number - 1) * descriptor.part_size,
  );
}
function readStatus(value: unknown): Status {
  const data = object(value),
    descriptor = parseMultipartDescriptor(data);
  if (!Array.isArray(data.parts))
    throw new Error("Invalid multipart part list");
  const seen = new Set<number>();
  const parts = data.parts.map((value) => {
    const part = object(value);
    if (
      typeof part.part_number !== "number" ||
      !Number.isInteger(part.part_number) ||
      part.part_number < 1 ||
      part.part_number > descriptor.part_count ||
      seen.has(part.part_number) ||
      part.bytes !== partBytes(descriptor, part.part_number)
    )
      throw new Error("Invalid multipart part list");
    seen.add(part.part_number);
    return { part_number: part.part_number, bytes: part.bytes as number };
  });
  const verified =
    data.receipt === null ? null : receipt(data.receipt, descriptor.asset_id);
  if (
    (descriptor.status === "uploaded" || descriptor.status === "ready") &&
    !verified
  )
    throw new Error("Verified upload receipt missing");
  if (verified && !["uploaded", "ready"].includes(descriptor.status))
    throw new Error("Unexpected upload receipt");
  return { ...descriptor, parts, receipt: verified };
}
function signedParts(
  value: unknown,
  descriptor: MultipartDescriptor,
  requested: number[],
): SignedPart[] {
  const data = object(value);
  if (!Array.isArray(data.parts) || data.parts.length !== requested.length)
    throw new Error("Invalid signed part response");
  const seen = new Set<number>();
  return data.parts.map((value) => {
    const part = object(value),
      headers = object(part.headers);
    const url = new URL(String(part.upload_url));
    if (
      typeof part.part_number !== "number" ||
      !requested.includes(part.part_number) ||
      seen.has(part.part_number) ||
      part.bytes !== partBytes(descriptor, part.part_number) ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !url.hostname.endsWith(".r2.cloudflarestorage.com") ||
      headers["Content-Type"] !== "video/mp4" ||
      !date(part.expires_at)
    )
      throw new Error("Invalid signed part response");
    seen.add(part.part_number);
    return {
      part_number: part.part_number,
      bytes: part.bytes as number,
      upload_url: url.href,
      headers: { "Content-Type": "video/mp4" },
      expires_at: part.expires_at,
    };
  });
}
async function data(reply: PromiseLike<Reply>, errorMessage: string) {
  const result = await reply;
  if (result.error) {
    const error = result.error as {
      message?: unknown;
      context?: unknown;
      status?: unknown;
    };
    let detail = typeof error.message === "string" ? error.message : "";
    let status = typeof error.status === "number" ? error.status : 0;
    if (error.context instanceof Response) {
      status ||= error.context.status;
      try {
        const body = (await error.context.clone().json()) as {
          error?: unknown;
        };
        if (typeof body.error === "string") detail = body.error;
      } catch {
        // Keep the calm fallback when the server response is not readable JSON.
      }
    }
    if (/available processor capacity/i.test(detail))
      throw new Error(
        "There isn’t enough processing capacity for this film right now. Try again later or choose a smaller export.",
      );
    if (status === 429)
      throw new Error("Too many upload attempts. Wait a little, then try again.");
    throw new Error(errorMessage);
  }
  return result.data;
}
function hex(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Read only one 16 MiB slice at a time; reselecting a file checks every byte, not its name/date. */
export async function fingerprintFilm(
  blob: UploadSource,
  signal?: AbortSignal,
  onProgress?: (bytes: number) => void,
  digest: Digest = (value) => crypto.subtle.digest("SHA-256", value),
) {
  validateUpload("film", blob);
  const parts: string[] = [];
  for (let offset = 0; offset < blob.size; offset += FINGERPRINT_CHUNK_SIZE) {
    signal?.throwIfAborted();
    const chunk = await blob
      .slice(offset, Math.min(offset + FINGERPRINT_CHUNK_SIZE, blob.size))
      .arrayBuffer();
    signal?.throwIfAborted();
    parts.push(hex(await digest(chunk)));
    signal?.throwIfAborted();
    onProgress?.(Math.min(offset + FINGERPRINT_CHUNK_SIZE, blob.size));
  }
  const manifest = JSON.stringify({
    version: 1,
    size: blob.size,
    type: blob.type,
    parts,
  });
  const result = hex(await digest(new TextEncoder().encode(manifest).buffer));
  signal?.throwIfAborted();
  return result;
}

export function createMultipartUploadTask(
  blob: UploadSource,
  api: MultipartApi,
  options: {
    draftId: string;
    requestId?: string;
    existing?: MultipartDescriptor;
    checkpoint?: MultipartCheckpointPort;
    onChange?: (state: Readonly<MultipartState>) => void;
    transport: MultipartTransport;
    digest?: Digest;
    randomId?: () => string;
    /** Native content URIs can change while paused; check every byte before each resume. */
    rehashOnStart?: boolean;
    now?: () => number;
  },
) {
  validateUpload("film", blob);
  if (
    !uuid.test(options.draftId) ||
    (options.requestId && !uuid.test(options.requestId))
  )
    throw new Error("Invalid upload identity");
  const transport = options.transport,
    now = options.now ?? Date.now;
  let descriptor = options.existing
    ? parseMultipartDescriptor(options.existing)
    : undefined;
  if (
    descriptor &&
    (descriptor.draft_id !== options.draftId || descriptor.bytes !== blob.size)
  )
    throw new Error("Upload descriptor belongs to another draft or file");
  let checkpoint: MultipartCheckpoint | null = null;
  let fingerprint: string | undefined;
  let reservationAttempted = false;
  let controller: AbortController | null = null;
  let running: Promise<UploadReceipt> | null = null;
  let discarding = false;
  let discarded = false;
  let result: UploadReceipt | undefined;
  let state: MultipartState = {
    stage: "idle",
    bytesSent: 0,
    totalBytes: blob.size,
    hashedBytes: 0,
    ...(descriptor ? { assetId: descriptor.asset_id } : {}),
  };
  const emit = (patch: Partial<MultipartState>) => {
    state = { ...state, ...patch };
    try {
      options.onChange?.({ ...state });
    } catch {
      /* Observers cannot change upload correctness. */
    }
  };
  function matches(value: MultipartDescriptor) {
    if (
      value.draft_id !== options.draftId ||
      value.bytes !== blob.size ||
      (fingerprint !== undefined && value.fingerprint !== fingerprint) ||
      (descriptor && value.asset_id !== descriptor.asset_id) ||
      (checkpoint?.asset_id && value.asset_id !== checkpoint.asset_id)
    )
      throw new Error(
        "This file does not match the saved upload. Reselect the original file or explicitly discard that upload.",
      );
    descriptor = value;
    emit({ assetId: value.asset_id });
  }
  async function saveCheckpoint() {
    if (!checkpoint) return;
    checkpoint = {
      ...checkpoint,
      asset_id: descriptor?.asset_id ?? checkpoint.asset_id,
    };
    await options.checkpoint?.write({ ...checkpoint });
  }
  function validateCheckpoint(
    stored: MultipartCheckpoint,
  ): MultipartCheckpoint {
    if (
      !uuid.test(stored.request_id) ||
      (stored.asset_id !== null && !uuid.test(stored.asset_id)) ||
      stored.draft_id !== options.draftId ||
      stored.bytes !== blob.size ||
      stored.fingerprint !== fingerprint ||
      (options.requestId && stored.request_id !== options.requestId)
    )
      throw new Error("This file does not match the saved upload checkpoint.");
    return {
      request_id: stored.request_id,
      asset_id: stored.asset_id,
      draft_id: stored.draft_id,
      bytes: stored.bytes,
      fingerprint: stored.fingerprint,
    };
  }
  async function initialize(signal: AbortSignal) {
    if (!fingerprint) {
      emit({ stage: "hashing" });
      fingerprint = await fingerprintFilm(
        blob,
        signal,
        (hashedBytes) => emit({ hashedBytes }),
        options.digest,
      );
    }
    signal.throwIfAborted();
    if (!checkpoint) {
      const stored = await options.checkpoint?.read();
      if (stored) {
        checkpoint = validateCheckpoint(stored);
      } else
        checkpoint = {
          request_id:
            options.requestId ??
            (options.randomId ?? (() => crypto.randomUUID()))(),
          asset_id: descriptor?.asset_id ?? null,
          draft_id: options.draftId,
          bytes: blob.size,
          fingerprint,
        };
    }
    if (descriptor) matches(descriptor);
    if (
      checkpoint.asset_id &&
      descriptor &&
      checkpoint.asset_id !== descriptor.asset_id
    )
      throw new Error("Upload checkpoint belongs to another asset");
    await saveCheckpoint();
    signal.throwIfAborted();
    if (!descriptor && checkpoint.asset_id) {
      matches(
        readStatus(
          await data(
            api.status(checkpoint.asset_id),
            "Could not recover your saved upload. Retry without creating another reservation.",
          ),
        ),
      );
    }
    if (!descriptor) {
      emit({ stage: "reserving" });
      reservationAttempted = true;
      const created = parseMultipartDescriptor(
        await data(
          api.create({
            draft_id: options.draftId,
            request_id: checkpoint.request_id,
            bytes: blob.size,
            content_type: "video/mp4",
            fingerprint,
          }),
          "Could not start the upload. Retry to recover the same reservation.",
        ),
      );
      matches(created);
      await saveCheckpoint();
    }
    signal.throwIfAborted();
  }
  async function canonical(signal: AbortSignal) {
    signal.throwIfAborted();
    if (!descriptor) throw new Error("Upload reservation missing");
    const value = readStatus(
      await data(
        api.status(descriptor.asset_id),
        "Could not check uploaded parts. Retry to recover your progress.",
      ),
    );
    matches(value);
    signal.throwIfAborted();
    if (["aborting", "aborted", "expired"].includes(value.status))
      throw new Error(
        "This upload is unavailable or expired. Discard it before choosing a new upload.",
      );
    if (!value.receipt && Date.parse(value.resume_expires_at) <= now())
      throw new Error("This upload's resume deadline has passed.");
    emit({
      bytesSent: value.receipt
        ? blob.size
        : value.parts.reduce((sum, part) => sum + part.bytes, 0),
    });
    return value;
  }
  async function accepted(value: UploadReceipt) {
    result = value;
    emit({ stage: "complete", bytesSent: blob.size, error: undefined });
    // A local storage failure must not turn a committed verified upload into a failed transfer.
    try {
      await options.checkpoint?.clear();
    } catch {
      /* The server receipt remains authoritative. */
    }
    return value;
  }
  async function run(): Promise<UploadReceipt> {
    controller = new AbortController();
    const signal = controller.signal;
    try {
      emit({ error: undefined });
      if (options.rehashOnStart) fingerprint = undefined;
      await initialize(signal);
      let current = await canonical(signal);
      if (current.receipt) return accepted(current.receipt);
      const done = new Map(
        current.parts.map((part) => [part.part_number, part.bytes]),
      );
      if (current.status !== "completing") {
        const missing = Array.from(
          { length: current.part_count },
          (_, index) => index + 1,
        ).filter((number) => !done.has(number));
        for (let offset = 0; offset < missing.length; offset += 2) {
          signal.throwIfAborted();
          const requested = missing.slice(offset, offset + 2);
          let batch = signedParts(
            await data(
              api.sign({ asset_id: current.asset_id, part_numbers: requested }),
              "Could not sign upload parts. Retry with this same reservation.",
            ),
            current,
            requested,
          );
          signal.throwIfAborted();
          for (const number of requested) {
            let part = batch.find((part) => part.part_number === number)!;
            // On a slow connection the second URL may expire before its turn. Refresh only that part.
            if (Date.parse(part.expires_at) <= now() + 5000) {
              batch = signedParts(
                await data(
                  api.sign({
                    asset_id: current.asset_id,
                    part_numbers: [number],
                  }),
                  "Could not refresh the upload signature. Retry this same upload.",
                ),
                current,
                [number],
              );
              part = batch[0]!;
              if (Date.parse(part.expires_at) <= now() + 5000)
                throw new Error(
                  "Storage signature expires too soon. Retry later.",
                );
            }
            signal.throwIfAborted();
            emit({ stage: "uploading" });
            const acknowledged = Array.from(done.values()).reduce(
              (sum, bytes) => sum + bytes,
              0,
            );
            const slice = blob.slice(
              (number - 1) * current.part_size,
              Math.min(number * current.part_size, blob.size),
              "video/mp4",
            );
            await transport(
              part.upload_url,
              part.headers,
              slice,
              signal,
              (bytes) =>
                emit({
                  bytesSent:
                    acknowledged + Math.max(0, Math.min(slice.size, bytes)),
                }),
            );
            done.set(number, part.bytes);
            emit({ bytesSent: acknowledged + part.bytes });
            signal.throwIfAborted();
          }
        }
      }
      current = await canonical(signal); // Never complete from client-local success flags or stale ETags.
      if (current.receipt) return accepted(current.receipt);
      if (
        current.parts.length !== current.part_count &&
        current.status !== "completing"
      )
        throw new Error(
          "Storage has not confirmed all parts. Retry to upload only missing parts.",
        );
      emit({ stage: "verifying" });
      let finished: unknown;
      try {
        finished = await data(
          api.finish(current.asset_id),
          "Upload completion could not be confirmed.",
        );
      } catch {
        const recovered = await canonical(signal);
        if (recovered.receipt) return accepted(recovered.receipt);
        throw new Error(
          "Completion could not be confirmed. Retry to reconcile this same upload; do not start another reservation.",
        );
      }
      return accepted(receipt(finished, current.asset_id));
    } catch (error) {
      const paused = signal.aborted;
      emit({
        stage: paused ? "paused" : "error",
        error: paused
          ? undefined
          : error instanceof Error
            ? error.message
            : "Upload failed. Retry this same upload.",
      });
      throw error;
    } finally {
      controller = null;
    }
  }
  return {
    get state(): Readonly<MultipartState> {
      return { ...state };
    },
    start(): Promise<UploadReceipt> {
      if (result) return Promise.resolve(result);
      if (discarded)
        return Promise.reject(new Error("This upload has been discarded"));
      if (running || discarding)
        return Promise.reject(new Error("Upload operation is already running"));
      running = run();
      return running.finally(() => {
        running = null;
      });
    },
    pause() {
      controller?.abort();
    },
    cancel() {
      controller?.abort();
    },
    async discard(): Promise<"aborting" | "aborted"> {
      if (discarding) throw new Error("Discard is already running");
      discarding = true;
      controller?.abort();
      try {
        if (running) {
          try {
            await running;
          } catch {
            /* Pause settles before server-side abort. */
          }
        }
        if (result)
          throw new Error(
            "This upload is already verified. Remove its draft or film to delete it.",
          );
        if (!descriptor && !checkpoint) {
          const stored = await options.checkpoint?.read();
          if (stored) {
            fingerprint ??= await fingerprintFilm(
              blob,
              undefined,
              undefined,
              options.digest,
            );
            checkpoint = validateCheckpoint(stored);
            reservationAttempted = checkpoint.asset_id === null;
          }
        }
        // An ambiguous create reply is reconciled with the SAME idempotency key before aborting.
        if (!descriptor && reservationAttempted && checkpoint && fingerprint) {
          matches(
            parseMultipartDescriptor(
              await data(
                api.create({
                  draft_id: options.draftId,
                  request_id: checkpoint.request_id,
                  bytes: blob.size,
                  content_type: "video/mp4",
                  fingerprint,
                }),
                "Could not recover this reservation to discard it. Retry discard.",
              ),
            ),
          );
          await saveCheckpoint();
        }
        if (!descriptor) {
          if (checkpoint?.asset_id)
            matches(
              readStatus(
                await data(
                  api.status(checkpoint.asset_id),
                  "Could not recover upload to discard it.",
                ),
              ),
            );
          else {
            await options.checkpoint?.clear();
            discarded = true;
            emit({ stage: "aborted" });
            return "aborted";
          }
        }
        const assetId = descriptor?.asset_id;
        if (!assetId) throw new Error("Upload reservation missing");
        emit({ stage: "aborting", error: undefined });
        const reply = object(
          await data(
            api.abort(assetId),
            "Discard could not be confirmed. Retry; storage remains reserved until cleanup succeeds.",
          ),
        );
        if (reply.status !== "aborting" && reply.status !== "aborted")
          throw new Error("Invalid upload abort response");
        discarded = true;
        if (reply.status === "aborted") await options.checkpoint?.clear();
        emit({ stage: reply.status });
        return reply.status;
      } catch (error) {
        emit({
          stage: "error",
          error: error instanceof Error ? error.message : "Discard failed",
        });
        throw error;
      } finally {
        discarding = false;
      }
    },
  };
}
