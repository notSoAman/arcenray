import { admin, env } from "./http.ts";

export type AccountDeletionJob = {
  id: string;
  issuer: string;
  subject: string;
  clerk_deleted: boolean;
};
export class AccountCleanupError extends Error {
  constructor(
    public code: "identity" | "configuration" | "clerk" | "database",
  ) {
    super(code);
  }
}
function validate(job: AccountDeletionJob) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      job.id,
    ) ||
    !/^user_[A-Za-z0-9]+$/.test(job.subject) ||
    typeof job.clerk_deleted !== "boolean"
  )
    throw new AccountCleanupError("identity");
}
export async function deleteClerkIdentity(
  job: AccountDeletionJob,
  configuration: { issuer: string; secret: string },
  request: typeof fetch = fetch,
  deadline = Date.now() + 8000,
) {
  validate(job);
  if (
    !configuration.secret ||
    !configuration.issuer ||
    job.issuer !== configuration.issuer
  )
    throw new AccountCleanupError("configuration");
  try {
    const issuer = new URL(configuration.issuer);
    if (
      issuer.protocol !== "https:" ||
      issuer.username ||
      issuer.password ||
      issuer.pathname !== "/" ||
      issuer.search ||
      issuer.hash
    )
      throw new Error();
  } catch {
    throw new AccountCleanupError("configuration");
  }
  try {
    const remaining = Math.floor(deadline - Date.now());
    if (remaining <= 0) throw new Error();
    // Host and method are fixed. Never follow a redirect carrying the secret key.
    const response = await request(
      `https://api.clerk.com/v1/users/${encodeURIComponent(job.subject)}`,
      {
        method: "DELETE",
        redirect: "error",
        headers: { Authorization: `Bearer ${configuration.secret}` },
        signal: AbortSignal.timeout(Math.min(8000, remaining)),
      },
    );
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok && response.status !== 404) throw new Error();
  } catch {
    throw new AccountCleanupError("clerk");
  }
}
export type AccountCleanupPorts = {
  deleteIdentity: (job: AccountDeletionJob) => Promise<void>;
  markDeleted: (id: string) => Promise<void>;
  finish: (id: string) => Promise<boolean>;
  defer: (id: string) => Promise<void>;
};
/** External deletion is recorded before final cascade; media jobs can defer finish. */
export async function executeAccountDeletion(
  job: AccountDeletionJob,
  ports: AccountCleanupPorts,
) {
  validate(job);
  try {
    if (!job.clerk_deleted) {
      await ports.deleteIdentity(job);
      await ports.markDeleted(job.id);
    }
    return await ports.finish(job.id);
  } catch (error) {
    // Failed jobs move behind other due accounts; an unavailable provider or
    // broken credential must not monopolize the oldest three queue positions.
    await ports.defer(job.id);
    throw error;
  }
}
export async function processAccountDeletions(deadline = Date.now() + 14000) {
  const db = admin();
  const { data, error } = await db
    .rpc("backend_pending_account_deletions")
    .abortSignal(AbortSignal.timeout(2000));
  if (error || !Array.isArray(data)) throw new AccountCleanupError("database");
  const ports: AccountCleanupPorts = {
    async deleteIdentity(job) {
      let issuer: string, secret: string;
      try {
        issuer = env("CLERK_ISSUER");
        secret = env("CLERK_SECRET_KEY");
      } catch {
        throw new AccountCleanupError("configuration");
      }
      // Reserve six seconds for mark+finish and a failed-job defer if needed.
      await deleteClerkIdentity(
        job,
        { issuer, secret },
        fetch,
        deadline - 6000,
      );
    },
    async markDeleted(id) {
      const { error } = await db
        .rpc("backend_mark_clerk_deleted", {
          p_job: id,
        })
        .abortSignal(AbortSignal.timeout(2000));
      if (error) throw new AccountCleanupError("database");
    },
    async finish(id) {
      const result = await db
        .rpc("backend_finish_account_deletion", {
          p_job: id,
        })
        .abortSignal(AbortSignal.timeout(2000));
      if (result.error || typeof result.data !== "boolean")
        throw new AccountCleanupError("database");
      return result.data;
    },
    async defer(id) {
      const remaining = Math.max(1, Math.min(2000, deadline - Date.now()));
      const { error } = await db
        .rpc("backend_defer_account_deletion", { p_job: id })
        .abortSignal(AbortSignal.timeout(remaining));
      if (error) throw new AccountCleanupError("database");
    },
  };
  const results = await Promise.allSettled(
    data
      .slice(0, 3)
      .map((job) => executeAccountDeletion(job as AccountDeletionJob, ports)),
  );
  // Failed external requests remain queued. Counts contain no subjects, emails,
  // provider payloads, keys or database error messages.
  return {
    accounts_finished: results.filter(
      (result) => result.status === "fulfilled" && result.value,
    ).length,
    accounts_waiting_for_media: results.filter(
      (result) => result.status === "fulfilled" && !result.value,
    ).length,
    accounts_failed: results.filter((result) => result.status === "rejected")
      .length,
  };
}
