import assert from "node:assert/strict";
import test from "node:test";
import * as layout from "../src/native-layout.ts";

test("floating navigation stays above the gesture area without compressing its controls", () => {
  assert.deepEqual(layout.floatingTabBarLayout(0), { height: 66, marginBottom: 12 });
  assert.deepEqual(layout.floatingTabBarLayout(34), { height: 66, marginBottom: 46 });
  assert.deepEqual(layout.floatingTabBarLayout(-1), { height: 66, marginBottom: 12 });
});
