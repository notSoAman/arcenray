import assert from "node:assert/strict";
import test from "node:test";
import { initialProfileHandle, signupHandle } from "@repo/shared";

test("a Clerk username seeds the canonical public handle", () => {
  assert.equal(signupHandle("Aman_Singh"), "aman_singh");
  assert.equal(signupHandle("aman.singh-film"), "aman_singh_film");
  assert.equal(signupHandle("x"), null);
  assert.equal(signupHandle("not valid"), null);
});

test("a pending UUID handle becomes the Clerk username without replacing edits", () => {
  const id = "59000000-0000-4000-8000-000000000001";
  assert.equal(
    initialProfileHandle({ id, handle: id.replaceAll("-", "") }, "aman"),
    "aman",
  );
  assert.equal(
    initialProfileHandle({ id, handle: "saved_creative" }, "aman"),
    "saved_creative",
  );
});

test("the web and mobile onboarding seed share the same behavior", () => {
  assert.equal(signupHandle("aman.director-film"), "aman_director_film");
  assert.equal(
    initialProfileHandle(
      {
        id: "59000000-0000-4000-8000-000000000001",
        handle: "saved_creative",
      },
      null,
    ),
    "saved_creative",
  );
});
