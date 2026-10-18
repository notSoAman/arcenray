import { test } from "node:test";
import assert from "node:assert/strict";
import {
  executeIndexJob,
  processIndexQueue,
  validIndexJob,
  validOperationsSecret,
  type IndexJob,
  type IndexQueuePorts,
} from "./index-queue.ts";
const job: IndexJob = {
  kind: "film",
  entity_id: "19000000-0000-0000-0000-000000000001",
  owner_id: "19000000-0000-0000-0000-000000000002",
  version: 3,
  source_updated_at: "2026-10-18T00:00:00Z",
  content: "Independent short film",
};
function fixture() {
  const calls: string[] = [];
  const ports: IndexQueuePorts = {
    async claim() {
      return [job];
    },
    async embed(content) {
      assert.equal(content, job.content);
      calls.push("embed");
      return Array(384).fill(0.1);
    },
    async save(actual, vector, hash) {
      assert.deepEqual(actual, job);
      assert.equal(vector.length, 384);
      assert.match(hash, /^[a-f0-9]{64}$/);
      calls.push("save");
      return true;
    },
    async finish(actual, success) {
      assert.deepEqual(actual, job);
      calls.push(`finish:${success}`);
      return true;
    },
  };
  return { ports, calls };
}
test("queue requires the dedicated nonempty operations secret", () => {
  assert.ok(validOperationsSecret("operation-secret", "operation-secret"));
  for (const supplied of ["", "wrong", "operation-secret-more"])
    assert.ok(!validOperationsSecret(supplied, "operation-secret"));
  assert.ok(!validOperationsSecret("", ""));
});
test("job validation rejects guessed paths, wrong profile owners, oversized text and invalid versions", () => {
  assert.ok(validIndexJob(job));
  for (const change of [
    { entity_id: "../someone" },
    { version: 0 },
    { version: Number.MAX_SAFE_INTEGER + 1 },
    { content: "x".repeat(6001) },
    { source_updated_at: "not a timestamp" },
    { kind: "profile" as const },
  ])
    assert.ok(!validIndexJob({ ...job, ...change }));
  assert.ok(validIndexJob({ ...job, content: "🎞".repeat(6000) }));
});
test("successful inference requires both source CAS and job-version acknowledgement", async () => {
  const { ports, calls } = fixture();
  assert.equal(await executeIndexJob(job, ports), "indexed");
  assert.deepEqual(calls, ["embed", "save", "finish:true"]);
  calls.length = 0;
  ports.finish = async (_job, success) => {
    calls.push(`finish:${success}`);
    return false;
  };
  assert.equal(await executeIndexJob(job, ports), "stale");
  assert.deepEqual(calls, ["embed", "save", "finish:true"]);
});
test("stale source writes never count as indexed or acknowledge success", async () => {
  const { ports, calls } = fixture();
  ports.save = async () => {
    calls.push("save");
    return false;
  };
  assert.equal(await executeIndexJob(job, ports), "stale");
  assert.deepEqual(calls, ["embed", "save", "finish:false"]);
});
test("model outage and invalid model vectors retry without a write", async () => {
  for (const vector of [null, [], Array(384).fill(Number.NaN)]) {
    const { ports, calls } = fixture();
    ports.embed = async () => {
      calls.push("embed");
      if (vector === null) throw new Error("provider details");
      return vector;
    };
    assert.equal(await executeIndexJob(job, ports), "failed");
    assert.deepEqual(calls, ["embed", "finish:false"]);
  }
});
test("save failure retries and one failed job does not prevent remaining bounded work", async () => {
  const { ports, calls } = fixture();
  ports.claim = async () => [job, job, job];
  let n = 0;
  ports.save = async () => {
    calls.push("save");
    if (++n === 1) throw new Error("database");
    return true;
  };
  assert.deepEqual(await processIndexQueue(ports), {
    indexed: 2,
    stale: 0,
    failed: 1,
  });
  assert.equal(calls.filter((call) => call === "embed").length, 3);
  assert.equal(calls.filter((call) => call === "finish:false").length, 1);
});
test("oversized batches and malformed claimed identities cause no inference or writes", async () => {
  const { ports, calls } = fixture();
  ports.claim = async () => Array(4).fill(job);
  await assert.rejects(processIndexQueue(ports));
  assert.deepEqual(calls, []);
  ports.claim = async () => [{ ...job, entity_id: "forged" }];
  assert.deepEqual(await processIndexQueue(ports), {
    indexed: 0,
    stale: 0,
    failed: 1,
  });
  assert.deepEqual(calls, []);
});
