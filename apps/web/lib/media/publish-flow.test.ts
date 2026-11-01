import assert from "node:assert/strict";
import { test } from "node:test";
import {
  recoveryNeeded,
  processingAsset,
  publicationDestination,
} from "./publish-flow.ts";

test("an active or completed upload never asks the creator to reselect it", () => {
  for (const stage of [
    "hashing",
    "reserving",
    "uploading",
    "verifying",
    "complete",
  ])
    assert.equal(recoveryNeeded(stage, true), false, stage);
  assert.equal(recoveryNeeded("paused", true), true);
  assert.equal(recoveryNeeded("error", true), true);
  assert.equal(recoveryNeeded(undefined, true), true);
  assert.equal(recoveryNeeded(undefined, false), false);
});

test("replacement upload cannot show the previous film's processing failure", () => {
  assert.equal(processingAsset("old", undefined), "old");
  for (const stage of [
    "idle",
    "hashing",
    "reserving",
    "uploading",
    "verifying",
    "error",
    "paused",
  ])
    assert.equal(processingAsset("old", { stage, assetId: "new" }), null);
  assert.equal(
    processingAsset("old", { stage: "complete", assetId: "new" }),
    null,
  );
  assert.equal(
    processingAsset("new", { stage: "complete", assetId: "new" }),
    "new",
  );
});

test("navigation requires server acknowledgement and follows the creator's choice", () => {
  assert.equal(publicationDestination("film", "pending", false), null);
  assert.equal(publicationDestination("film", "processing", false), null);
  assert.equal(
    publicationDestination("film", "pending", true),
    "/home?publication=queued",
  );
  assert.equal(publicationDestination("film", "complete", true), "/films/film");
  assert.equal(
    publicationDestination("film", "complete", false),
    "/films/film",
  );
  for (const state of [null, "failed", "cancelled"])
    assert.equal(publicationDestination("film", state, true), null);
});
