import { admin, env } from "./http.ts";
import { copyLifecycleObject, r2Lifecycle } from "./r2.ts";

export type MediaJob = {
  asset_id: string;
  owner_id: string;
  object_key: string;
  public_key: string | null;
  content_type: string;
  bytes: number;
  etag: string | null;
  action: "delete" | "quarantine" | "restore";
  version: number;
  private_delete_after: string;
  state: string;
  attempts: number;
};
type ObjectSnapshot = { bytes: number; etag: string; contentType: string };
export type MediaPorts = {
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
    job.bytes > 2147483648 ||
    !["video/mp4", "image/webp"].includes(job.content_type) ||
    !Number.isFinite(Date.parse(job.private_delete_after)) ||
    (job.etag !== null &&
      !/^(?:"[a-fA-F0-9-]+"|[a-fA-F0-9-]+)$/.test(job.etag)) ||
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
function matches(object: ObjectSnapshot | null, job: MediaJob) {
  return (
    object !== null &&
    object.bytes === job.bytes &&
    object.etag.replace(/^"|"$/g, "") === job.etag?.replace(/^"|"$/g, "") &&
    object.contentType === job.content_type
  );
}

/** Retry-safe per-asset work, with injectable I/O for failure-path tests. */
export async function executeMediaJob(
  input: MediaJob,
  ports: MediaPorts,
  now = Date.now(),
): Promise<string | null> {
  const job = validateMediaJob(input);
  const publicKey = `assets/${job.asset_id}`,
    backup = `quarantine/${job.asset_id}`;
  if (job.action === "delete") {
    await ports.remove("public", publicKey);
    await ports.purge(publicKey);
    // Existing signatures may still recreate the original staging object. Keep
    // accounting/identity records until they have expired and this job retries.
    if (Date.parse(job.private_delete_after) > now)
      return job.private_delete_after;
    await ports.remove("private", job.object_key);
    await ports.remove("private", backup);
    return null;
  }
  if (job.action === "quarantine") {
    const existing = await ports.head("private", backup);
    if (existing && !matches(existing, job)) throw new MediaJobError("storage");
    if (!existing) {
      const published = await ports.head("public", publicKey);
      let source: "public" | "private" = "public";
      let sourceKey = publicKey;
      if (!published) {
        source = "private";
        sourceKey = job.object_key;
      }
      const snapshot = published ?? (await ports.head("private", sourceKey));
      if (!matches(snapshot, job)) throw new MediaJobError("source_missing");
      await ports.copy(
        source,
        sourceKey,
        "private",
        backup,
        snapshot!.etag,
        job.content_type,
      );
      if (!matches(await ports.head("private", backup), job))
        throw new MediaJobError("storage");
    }
    await ports.remove("public", publicKey);
    await ports.purge(publicKey);
    return null;
  }
  const backupSnapshot = await ports.head("private", backup);
  const published = await ports.head("public", publicKey);
  if (backupSnapshot) {
    if (!matches(backupSnapshot, job)) throw new MediaJobError("storage");
    await ports.copy(
      "private",
      backup,
      "public",
      publicKey,
      backupSnapshot.etag,
      job.content_type,
    );
    if (!matches(await ports.head("public", publicKey), job))
      throw new MediaJobError("storage");
  } else if (!matches(published, job)) {
    // A completed copy followed by a database failure can leave only the valid
    // public object. Anything else fails closed rather than claiming restoration.
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
function productionPorts(deadline: number): MediaPorts {
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
      await copyLifecycleObject(
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
        const until = await executeMediaJob(job, productionPorts(workDeadline));
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
