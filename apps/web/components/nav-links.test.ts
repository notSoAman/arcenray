import assert from "node:assert/strict";
import test from "node:test";
import { avatarLabel, profileLinkTarget } from "./nav-links.ts";

test("guests keep the sign-in link with their current path", () => {
  assert.equal(
    profileLinkTarget(null, "/loop"),
    `/sign-in?next=${encodeURIComponent("/loop")}`,
  );
});

test("completed profiles link to their handle page", () => {
  assert.equal(
    profileLinkTarget(
      { name: "Aman", handle: "aman_singh", picKey: null, pending: false },
      "/home",
    ),
    "/u/aman_singh",
  );
});

test("pending profiles route to onboarding instead of the pending UUID handle", () => {
  assert.equal(
    profileLinkTarget(
      {
        name: "",
        handle: "ebbb0bdeb29f467dbcc39580209996a7",
        picKey: null,
        pending: true,
      },
      "/home",
    ),
    "/onboarding",
  );
});

test("pending avatars stay neutral instead of showing a UUID-derived initial", () => {
  assert.equal(
    avatarLabel({
      name: "Aman",
      handle: "x_handle",
      picKey: null,
      pending: true,
    }),
    "Aman",
  );
  assert.equal(
    avatarLabel({
      name: "",
      handle: "ebbb0bdeb29f467dbcc39580209996a7",
      picKey: null,
      pending: true,
    }),
    "You",
  );
  assert.equal(
    avatarLabel({
      name: "",
      handle: "aman_singh",
      picKey: null,
      pending: false,
    }),
    "aman_singh",
  );
});
