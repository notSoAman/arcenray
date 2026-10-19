import assert from "node:assert/strict";
import test from "node:test";
import { signupHandle, initialProfileHandle } from "./signup-profile.ts";
test("Clerk username seeds canonical handle without a second entry", () => {
  assert.equal(signupHandle("Aman_Singh"), "aman_singh");
  assert.equal(signupHandle("aman.singh-film"), "aman_singh_film");
  assert.equal(signupHandle(null), null);
  assert.equal(signupHandle("x"), null);
  assert.equal(signupHandle("not valid"), null);
});
test("pending UUID handles are replaced but later edited handles persist", () => {
  const id = "59000000-0000-4000-8000-000000000001";
  assert.equal(
    initialProfileHandle({ id, handle: id.replaceAll("-", "") }, "aman"),
    "aman",
  );
  assert.equal(
    initialProfileHandle({ id, handle: "new_public_handle" }, "aman"),
    "new_public_handle",
  );
});
