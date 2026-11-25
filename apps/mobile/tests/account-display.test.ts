import assert from "node:assert/strict";
import test from "node:test";
import { accountIdentity, accountScrollPadding } from "../src/account-display.ts";

test("pending profiles never expose the generated database handle", () => {
  const id = "ebbb0bdeb-29f4-67db-cc39-580209996a7";
  assert.deepEqual(
    accountIdentity({
      id,
      handle: id.replaceAll("-", ""),
      full_name: "",
      onboarding_completed: false,
    }),
    {
      title: "Your creative profile",
      handle: null,
      avatarName: "Arcenray creator",
    },
  );
});

test("completed profiles retain their public identity", () => {
  assert.deepEqual(
    accountIdentity({
      id: "profile-id",
      handle: "spica_s",
      full_name: "Spica S",
      onboarding_completed: true,
    }),
    { title: "Spica S", handle: "@spica_s", avatarName: "Spica S" },
  );
});

test("account actions clear the floating tab bar and gesture area", () => {
  assert.equal(accountScrollPadding(0), 144);
  assert.equal(accountScrollPadding(34), 178);
  assert.equal(accountScrollPadding(-1), 144);
});
