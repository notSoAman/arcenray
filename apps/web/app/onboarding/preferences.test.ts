import assert from "node:assert/strict";
import test from "node:test";
import { onboardingChoices, validOnboardingChoices } from "./preferences.ts";

test("vibe check offers twelve unique canonical references and requires three distinct choices", () => {
  assert.equal(onboardingChoices.length, 12);
  assert.equal(new Set(onboardingChoices.map(({ id }) => id)).size, 12);
  assert.equal(
    validOnboardingChoices(["atmospheric", "intimate", "musical"]),
    true,
  );
  for (const choices of [
    [],
    ["atmospheric"],
    ["intimate", "intimate", "musical"],
    ["atmospheric", "unknown", "musical"],
    ["atmospheric", "intimate", "musical", "hopeful"],
  ]) {
    assert.equal(validOnboardingChoices(choices), false);
  }
});
