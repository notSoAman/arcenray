import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AccountCleanupError,
  deleteClerkIdentity,
  executeAccountDeletion,
  type AccountDeletionJob,
  type AccountCleanupPorts,
} from "./account-cleanup.ts";
const job: AccountDeletionJob = {
  id: "18000000-0000-0000-0000-000000000001",
  issuer: "https://example.clerk.accounts.dev",
  subject: "user_fixtureABC123",
  clerk_deleted: false,
};
const configuration = { issuer: job.issuer, secret: "fake-unit-test-key" };
function ports() {
  const calls: string[] = [];
  const io: AccountCleanupPorts = {
    async deleteIdentity() {
      calls.push("delete");
    },
    async markDeleted() {
      calls.push("mark");
    },
    async finish() {
      calls.push("finish");
      return true;
    },
    async defer() {
      calls.push("defer");
    },
  };
  return { calls, io };
}
test("Clerk deletion uses the fixed backend host, exact user, DELETE and secret authorization", async () => {
  let calls = 0;
  const request: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(input, "https://api.clerk.com/v1/users/user_fixtureABC123");
    assert.equal(init?.method, "DELETE");
    assert.equal(init?.redirect, "error");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer fake-unit-test-key",
    );
    assert.ok(init?.signal);
    return new Response(null, { status: 200 });
  };
  await deleteClerkIdentity(job, configuration, request);
  assert.equal(calls, 1);
});
test("already-deleted Clerk user is idempotent, but denied/server/network errors fail closed", async () => {
  await deleteClerkIdentity(
    job,
    configuration,
    async () => new Response(null, { status: 404 }),
  );
  for (const status of [401, 403, 429, 500])
    await assert.rejects(
      deleteClerkIdentity(
        job,
        configuration,
        async () => new Response(null, { status }),
      ),
      (error) => error instanceof AccountCleanupError && error.code === "clerk",
    );
  await assert.rejects(
    deleteClerkIdentity(job, configuration, async () => {
      throw new Error("sensitive upstream details");
    }),
    (error) =>
      error instanceof AccountCleanupError && error.message === "clerk",
  );
});
test("wrong issuer, missing credentials and malformed subject cause zero external requests", async () => {
  let calls = 0;
  const request: typeof fetch = async () => {
    calls++;
    return new Response();
  };
  for (const config of [
    { ...configuration, issuer: "https://other.clerk.accounts.dev" },
    { ...configuration, secret: "" },
    { issuer: "", secret: "" },
  ])
    await assert.rejects(deleteClerkIdentity(job, config, request));
  await assert.rejects(
    deleteClerkIdentity(
      { ...job, subject: "user_../../victim" },
      configuration,
      request,
    ),
  );
  assert.equal(calls, 0);
});
test("provider deletion must succeed and be recorded before the database can finish", async () => {
  const { io, calls } = ports();
  assert.equal(await executeAccountDeletion(job, io), true);
  assert.deepEqual(calls, ["delete", "mark", "finish"]);
  calls.length = 0;
  io.deleteIdentity = async () => {
    calls.push("delete");
    throw new AccountCleanupError("clerk");
  };
  await assert.rejects(executeAccountDeletion(job, io));
  assert.deepEqual(calls, ["delete", "defer"]);
});
test("recorded Clerk deletion skips the provider; unfinished media never claims a final cascade", async () => {
  const { io, calls } = ports();
  io.finish = async () => {
    calls.push("finish");
    return false;
  };
  assert.equal(
    await executeAccountDeletion({ ...job, clerk_deleted: true }, io),
    false,
  );
  assert.deepEqual(calls, ["finish"]);
});
test("a mark failure leaves the job retryable without executing the cascade", async () => {
  const { io, calls } = ports();
  io.markDeleted = async () => {
    calls.push("mark");
    throw new AccountCleanupError("database");
  };
  await assert.rejects(executeAccountDeletion(job, io));
  assert.deepEqual(calls, ["delete", "mark", "defer"]);
});
test("expired cleanup budget starts no Clerk request; an active request aborts within its budget", async () => {
  let calls = 0;
  await assert.rejects(
    deleteClerkIdentity(
      job,
      configuration,
      async () => {
        calls++;
        return new Response();
      },
      Date.now() - 1,
    ),
  );
  assert.equal(calls, 0);
  await assert.rejects(
    deleteClerkIdentity(
      job,
      configuration,
      async (_input, init) => {
        calls++;
        return await new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        });
      },
      Date.now() + 20,
    ),
  );
  assert.equal(calls, 1);
});
test("only failed jobs defer: completion and media waiting do not back off, database failures do", async () => {
  const { io, calls } = ports();
  io.finish = async () => {
    calls.push("finish");
    throw new AccountCleanupError("database");
  };
  await assert.rejects(
    executeAccountDeletion({ ...job, clerk_deleted: true }, io),
  );
  assert.deepEqual(calls, ["finish", "defer"]);
  calls.length = 0;
  io.finish = async () => {
    calls.push("finish");
    return true;
  };
  await executeAccountDeletion({ ...job, clerk_deleted: true }, io);
  assert.deepEqual(calls, ["finish"]);
});
