export type IndexJob = {
  kind: "film" | "profile";
  entity_id: string;
  owner_id: string;
  version: number;
  source_updated_at: string;
  content: string;
};
export type IndexQueuePorts = {
  claim: () => Promise<IndexJob[]>;
  embed: (content: string) => Promise<number[]>;
  save: (job: IndexJob, vector: number[], hash: string) => Promise<boolean>;
  finish: (job: IndexJob, success: boolean) => Promise<boolean>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validIndexJob(job: IndexJob) {
  return (
    ["film", "profile"].includes(job.kind) &&
    uuid.test(job.entity_id) &&
    uuid.test(job.owner_id) &&
    (job.kind !== "profile" || job.owner_id === job.entity_id) &&
    Number.isSafeInteger(job.version) &&
    job.version > 0 &&
    typeof job.source_updated_at === "string" &&
    Number.isFinite(Date.parse(job.source_updated_at)) &&
    typeof job.content === "string" &&
    Array.from(job.content).length <= 6000 &&
    new TextEncoder().encode(job.content).byteLength <= 24000
  );
}
/** Dedicated operations secret is additional to the platform's JWT verification. */
export function validOperationsSecret(supplied: string, expected: string) {
  const a = new TextEncoder().encode(supplied),
    b = new TextEncoder().encode(expected);
  let difference = a.length ^ b.length;
  for (let n = 0; n < Math.max(a.length, b.length); n++)
    difference |= (a[n] ?? 0) ^ (b[n] ?? 0);
  return b.length > 0 && difference === 0;
}
export async function executeIndexJob(
  job: IndexJob,
  ports: IndexQueuePorts,
): Promise<"indexed" | "stale" | "failed"> {
  if (!validIndexJob(job)) throw new Error("Invalid index job");
  let saved: boolean;
  try {
    const vector = await ports.embed(job.content);
    if (
      !Array.isArray(vector) ||
      vector.length !== 384 ||
      vector.some((value) => !Number.isFinite(value))
    )
      throw new Error("Invalid embedding");
    const digest = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(job.content),
      ),
    );
    const hash = Array.from(digest, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    saved = await ports.save(job, vector, hash);
  } catch {
    await ports.finish(job, false);
    return "failed";
  }
  // A source or job version can change while inference runs. Only the database
  // acknowledges freshness; the worker never treats a successful write as proof.
  const completed = await ports.finish(job, saved);
  return saved && completed ? "indexed" : "stale";
}
export async function processIndexQueue(ports: IndexQueuePorts) {
  const claimed = await ports.claim();
  if (!Array.isArray(claimed) || claimed.length > 3)
    throw new Error("Invalid index batch");
  let indexed = 0,
    stale = 0,
    failed = 0;
  // Three maximum, sequential: preserve the runtime model's memory budget.
  for (const job of claimed) {
    try {
      const result = await executeIndexJob(job, ports);
      if (result === "indexed") indexed++;
      else if (result === "stale") stale++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { indexed, stale, failed };
}
