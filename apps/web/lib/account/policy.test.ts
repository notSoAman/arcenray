import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deletionConfirmation,
  hasSameOrigin,
  isRecentSession,
  readBoundedBody,
  validDeletionBody,
} from "./policy.ts";
test("deletion accepts only fresh real session creation times", () => {
  const now = 1800000000000;
  assert.equal(isRecentSession(now - 600000, now), true);
  for (const time of [now - 600001, now + 1, NaN, Infinity])
    assert.equal(isRecentSession(time, now), false);
});
test("deletion rejects cross-origin, absent, null and disguised origins", () => {
  for (const origin of [
    "https://evil.test",
    "null",
    "https://app.test/path",
    "https://app.test.evil.test",
  ])
    assert.equal(
      hasSameOrigin(
        new Request("https://app.test/api/account/delete", {
          headers: { origin },
        }),
      ),
      false,
    );
  assert.equal(
    hasSameOrigin(new Request("https://app.test/api/account/delete")),
    false,
  );
  assert.equal(
    hasSameOrigin(
      new Request("https://app.test/api/account/delete", {
        headers: { origin: "https://app.test" },
      }),
    ),
    true,
  );
});
test("deletion confirmation cannot carry caller-controlled profile or subject", () => {
  assert.equal(validDeletionBody({ confirmation: deletionConfirmation }), true);
  for (const body of [
    null,
    [],
    { confirmation: "delete my account" },
    { confirmation: deletionConfirmation, profile: "another-user" },
  ])
    assert.equal(validDeletionBody(body), false);
});
test("body limit measures actual UTF-8 bytes even without Content-Length", async () => {
  assert.equal(
    await readBoundedBody(
      new Request("https://app.test", { method: "POST", body: "small" }),
      5,
    ),
    "small",
  );
  await assert.rejects(
    readBoundedBody(
      new Request("https://app.test", { method: "POST", body: "😀😀" }),
      7,
    ),
  );
  await assert.rejects(
    readBoundedBody(
      new Request("https://app.test", {
        method: "POST",
        headers: { "content-length": "100" },
        body: "x",
      }),
      5,
    ),
  );
});
