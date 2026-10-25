import { admin, env } from "./http.ts";
import { createMultipartStorage } from "./multipart-storage.ts";
import { copyLifecycleObject, r2Lifecycle } from "./r2.ts";

export type MediaJob = {
  asset_id: string;
  owner_id: string;
  object_key: string;
  public_key: string | null;
  content_type: string;
  bytes: number;
  etag: string | null;
  source_etag?: string | null;
  backup_etag?: string | null;
  action: "delete" | "quarantine" | "restore";
  version: number;
  private_delete_after: string;
  state: string;
  attempts: number;
  multipart?: boolean;
};
type ObjectSnapshot = { bytes: number; etag: string; contentType: string };
export type MediaPorts = {
  abortMultipart?: (key: string) => Promise<void>;
  head: (
    area: "public" | "private",
    key: string,
  ) => Promise<ObjectSnapshot | null>;
  remove: (area: "public" | "private", key: string) => Promise<void>;
  copy: (
    from: "public" | "private",
    source: string,
    to: "public" | "private",
    destination: string,
    etag: string,
    type: string,
  ) => Promise<string>;
  checkpoint: (
    area: "public" | "private",
    snapshot: ObjectSnapshot,
  ) => Promise<void>;
  purge: (key: string) => Promise<void>;
};
export class MediaJobError extends Error {
  constructor(
    public code: "storage" | "purge" | "source_missing" | "database",
  ) {
    super(code);
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validateMediaJob(job: MediaJob) {
  if (
    (job.multipart !== undefined && typeof job.multipart !== "boolean") ||
    !uuid.test(job.asset_id) ||
    !uuid.test(job.owner_id) ||
    !job.object_key.startsWith(job.owner_id + "/") ||
    !uuid.test(job.object_key.slice(job.owner_id.length + 1)) ||
    (job.public_key !== null && job.public_key !== `assets/${job.asset_id}`) ||
    !["delete", "quarantine", "restore"].includes(job.action) ||
    job.state !== "processing" ||
    !Number.isSafeInteger(job.version) ||
    job.version < 1 ||
    !Number.isSafeInteger(job.attempts) ||
    job.attempts < 1 ||
    !Number.isSafeInteger(job.bytes) ||
    job.bytes <= 0 ||
    job.bytes > 5 * 1024 ** 4 ||
    !["video/mp4", "image/webp"].includes(job.content_type) ||
    !Number.isFinite(Date.parse(job.private_delete_after)) ||
    [job.etag, job.source_etag, job.backup_etag].some(
      (etag) =>
        etag != null && !/^(?:"[a-fA-F0-9-]+"|[a-fA-F0-9-]+)$/.test(etag),
    ) ||
    (job.action !== "delete" && !job.etag)
  )
    throw new MediaJobError("storage");
  return job;
}
export function exactPurgePayload(base: string, key: string) {
  const url = new URL(base);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !/^assets\/[0-9a-f-]{36}$/.test(key) ||
    !uuid.test(key.slice(7))
  )
    throw new MediaJobError("purge");
  return { files: [new URL(key, url).href] };
}
function matches(
  object: ObjectSnapshot | null,
  job: MediaJob,
  etag = job.etag,
) {
  return (
    object !== null &&
    object.bytes === job.bytes &&
    object.etag.replace(/^"|"$/g, "") === etag?.replace(/^"|"$/g, "") &&
    object.contentType === job.content_type
  );
}

/** Retry-safe per-asset work, with injectable I/O for failure-path tests. */
export async function executeMediaJob(
  input: MediaJob,
  ports: MediaPorts,
  now = Date.now(),
): Promise<string | null> {
  const job = { ...validateMediaJob(input) };
  const publicKey = `assets/${job.asset_id}`,
    backup = `quarantine/${job.asset_id}`;
  if (job.action === "delete") {
    if (job.multipart) {
      if (!ports.abortMultipart) throw new MediaJobError("storage");
      // Close every exact-key session first. A part signature cannot recreate a
      // completed object after its upload ID is aborted; writer grace is enforced
      // by the database claim deadline before this function can run.
      await ports.abortMultipart(job.object_key);
    }
    await ports.remove("public", publicKey);
    await ports.purge(publicKey);
    // Existing signatures may still recreate the original staging object. Keep
    // accounting/identity records until they have expired and this job retries.
    if (!job.multipart && Date.parse(job.private_delete_after) > now)
      return job.private_delete_after;
    await ports.remove("private", job.object_key);
    await ports.remove("private", backup);
    return null;
  }
  if (job.action === "quarantine") {
    const existing = await ports.head("private", backup);
    if (!matches(existing, job, job.backup_etag ?? job.etag)) {
      const published = await ports.head("public", publicKey);
      let source: "public" | "private" = "public";
      let sourceKey = publicKey;
      if (!published) {
        source = "private";
        sourceKey = job.object_key;
      }
      const snapshot = published ?? (await ports.head("private", sourceKey));
      const expected =
        source === "public" ? job.etag : (job.source_etag ?? job.etag);
      if (!matches(snapshot, job, expected))
        throw new MediaJobError("source_missing");
      // An uncheckpointed destination is never trusted by size alone. Recopy an
      // exact known source, pin the CopyObject result, then checkpoint before withdrawal.
      const copiedEtag = await ports.copy(
        source,
        sourceKey,
        "private",
        backup,
        snapshot!.etag,
        job.content_type,
      );
      const copied = await ports.head("private", backup);
      if (!matches(copied, job, copiedEtag)) throw new MediaJobError("storage");
      await ports.checkpoint("private", copied!);
      job.backup_etag = copied!.etag;
    }
    await ports.remove("public", publicKey);
    await ports.purge(publicKey);
    return null;
  }
  const backupSnapshot = await ports.head("private", backup);
  const published = await ports.head("public", publicKey);
  if (backupSnapshot) {
    if (!matches(backupSnapshot, job, job.backup_etag ?? job.etag))
      throw new MediaJobError("storage");
    const copiedEtag = await ports.copy(
      "private",
      backup,
      "public",
      publicKey,
      backupSnapshot.etag,
      job.content_type,
    );
    const copied = await ports.head("public", publicKey);
    if (!matches(copied, job, copiedEtag)) throw new MediaJobError("storage");
    await ports.checkpoint("public", copied!);
    job.etag = copied!.etag;
  } else if (!matches(published, job)) {
    throw new MediaJobError("source_missing");
  }
  await ports.purge(publicKey);
  await ports.remove("private", backup);
  return null;
}

export function lifecycleTimeout(
  deadline: number,
  maximum: number,
  now = Date.now(),
) {
  const remaining = Math.floor(deadline - now);
  if (remaining <= 0) throw new MediaJobError("storage");
  return Math.min(maximum, remaining);
}
function productionPorts(deadline: number, job: MediaJob): MediaPorts {
  // Validate purge configuration before deleting origin media. Missing credentials
  // leave the durable job failed/retryable, never falsely marked removed.
  let zone: string, token: string, base: string;
  try {
    zone = env("CLOUDFLARE_ZONE_ID");
    token = env("CLOUDFLARE_CACHE_PURGE_TOKEN");
    base = env("R2_PUBLIC_URL");
    if (!/^[a-f0-9]{32}$/.test(zone)) throw new Error();
    exactPurgePayload(base, "assets/00000000-0000-0000-0000-000000000000");
  } catch {
    throw new MediaJobError("purge");
  }
  const buckets = {
    public: env("R2_BUCKET_NAME"),
    private: env("R2_UPLOAD_BUCKET_NAME"),
  };
  return {
    abortMultipart: async (key) => {
      await createMultipartStorage().abortAll(key, deadline);
    },
    async head(area, key) {
      const response = await r2Lifecycle(
        "HEAD",
        buckets[area],
        key,
        lifecycleTimeout(deadline, 5000),
      );
      return response
        ? {
            bytes: Number(response.headers.get("content-length")),
            etag: response.headers.get("etag") ?? "",
            contentType:
              response.headers.get("content-type")?.split(";")[0] ?? "",
          }
        : null;
    },
    async remove(area, key) {
      await r2Lifecycle(
        "DELETE",
        buckets[area],
        key,
        lifecycleTimeout(deadline, 5000),
      );
    },
    async copy(from, source, to, destination, etag, type) {
      return await copyLifecycleObject(
        buckets[from],
        source,
        buckets[to],
        destination,
        etag,
        type,
        to === "public",
        lifecycleTimeout(deadline, 10000),
      );
    },
    async checkpoint(area, snapshot) {
      const result = await admin()
        .rpc("backend_record_media_copy", {
          p_asset: job.asset_id,
          p_version: job.version,
          p_area: area,
          p_etag: snapshot.etag,
          p_bytes: snapshot.bytes,
          p_content_type: snapshot.contentType,
        })
        .abortSignal(AbortSignal.timeout(lifecycleTimeout(deadline, 2000)));
      if (result.error || result.data !== true)
        throw new MediaJobError("database");
    },
    async purge(key) {
      try {
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(exactPurgePayload(base, key)),
            signal: AbortSignal.timeout(lifecycleTimeout(deadline, 5000)),
          },
        );
        const result = await response.json();
        if (!response.ok || result?.success !== true) throw new Error();
      } catch {
        throw new MediaJobError("purge");
      }
    },
  };
}
export async function processMediaJobs(deadline = Date.now() + 45000) {
  const db = admin();
  // Leave room for a bounded finish/fail SQL call after storage reaches deadline.
  const workDeadline = Math.min(Date.now() + 35000, deadline - 5000);
  const { data, error } = await db
    .rpc("backend_claim_media_jobs", {
      p_limit: 3,
    })
    .abortSignal(AbortSignal.timeout(2000));
  if (error || !Array.isArray(data)) throw new MediaJobError("database");
  let completed = 0,
    deferred = 0,
    failed = 0;
  // Run only the three leased jobs, concurrently. Each storage request is bounded;
  // serial batches could exhaust a later job's five-minute lease before starting.
  const outcomes = await Promise.allSettled(
    data.slice(0, 3).map(async (input) => {
      const job = input as MediaJob;
      try {
        validateMediaJob(job);
        const until = await executeMediaJob(
          job,
          productionPorts(workDeadline, job),
        );
        if (until) {
          const { error } = await db
            .rpc("backend_defer_media_job", {
              p_asset: job.asset_id,
              p_version: job.version,
              p_available_at: until,
            })
            .abortSignal(AbortSignal.timeout(2000));
          if (error) throw new MediaJobError("database");
          deferred++;
        } else {
          const result = await db
            .rpc("backend_finish_media_job", {
              p_asset: job.asset_id,
              p_version: job.version,
            })
            .abortSignal(AbortSignal.timeout(2000));
          if (result.error || result.data !== true)
            throw new MediaJobError("database");
          completed++;
        }
      } catch (error) {
        const code = error instanceof MediaJobError ? error.code : "storage";
        const result = await db
          .rpc("backend_fail_media_job", {
            p_asset: job.asset_id,
            p_version: job.version,
            p_error: code,
          })
          .abortSignal(AbortSignal.timeout(2000));
        if (result.error) throw new MediaJobError("database");
        failed++;
      }
    }),
  );
  if (outcomes.some((result) => result.status === "rejected"))
    throw new MediaJobError("database");
  return { completed, deferred, failed };
}
