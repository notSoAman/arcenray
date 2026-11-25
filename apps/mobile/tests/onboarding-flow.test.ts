import assert from "node:assert/strict";
import test from "node:test";
import { validateOnboardingStep } from "../src/onboarding-flow.ts";

test("onboarding validates the current step with a clear field message", () => {
  assert.equal(
    validateOnboardingStep(0, {
      name: "",
      handle: "new_user",
      roles: [],
      choices: [],
      skills: [],
    }),
    "Add your name to continue.",
  );
  assert.equal(
    validateOnboardingStep(0, {
      name: "Ari",
      handle: "ab",
      roles: [],
      choices: [],
      skills: [],
    }),
    "Choose a handle with 3–32 letters, numbers or underscores.",
  );
});

test("onboarding requires a creative role before moving on", () => {
  assert.equal(
    validateOnboardingStep(1, {
      name: "Ari",
      handle: "ari",
      roles: [],
      choices: [],
      skills: [],
    }),
    "Choose at least one creative role.",
  );
});

test("onboarding asks for exactly three valid references", () => {
  assert.equal(
    validateOnboardingStep(2, {
      name: "Ari",
      handle: "ari",
      roles: ["director"],
      choices: ["atmospheric", "unknown", "tense"],
      skills: [],
    }),
    "Choose three references to shape your first feed.",
  );
  assert.equal(
    validateOnboardingStep(2, {
      name: "Ari",
      handle: "ari",
      roles: ["director"],
      choices: ["atmospheric", "tense", "musical"],
      skills: [],
    }),
    null,
  );
});
