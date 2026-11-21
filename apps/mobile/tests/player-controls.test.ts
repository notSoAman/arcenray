import assert from "node:assert/strict";
import test from "node:test";
import { seekTarget } from "../src/player-controls.ts";
test("ten-second skips clamp to the loaded film and never produce invalid native seeks", () => {
  assert.equal(seekTarget(3, -10, 312), 0);
  assert.equal(seekTarget(309, 10, 312), 312);
  assert.equal(seekTarget(20, 10, 312), 30);
  assert.equal(seekTarget(20, 10, 0), 20);
  assert.equal(seekTarget(NaN, 10, 312), 0);
});
