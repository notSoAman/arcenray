import assert from "node:assert/strict";
import { test } from "node:test";
import { processingLabel, canRetryProcessing } from "./processing-status.ts";

test("permanent export problems explain the repair instead of offering the same retry", () => {
  const status = { state: "failed", error: "multiple_tracks" };
  assert.match(processingLabel(status), /one audio track/);
  assert.equal(canRetryProcessing(status), false);
  assert.equal(canRetryProcessing({ state: "failed", error: "storage" }), true);
  assert.doesNotMatch(
    processingLabel({ state: "failed", error: "private URL or secret" }),
    /private URL/,
  );
});
test("preparation distinguishes transfer and playback checks from encoding", () => {
  assert.match(
    processingLabel({ state: "processing", stage: "uploading" }),
    /Saving/,
  );
  assert.match(
    processingLabel({ state: "processing", stage: "checking" }),
    /plays correctly/,
  );
  assert.match(processingLabel({ state: "complete" }), /ready to publish/);
});
