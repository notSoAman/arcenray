import assert from "node:assert/strict";
import { test } from "node:test";
import { nextPromptPreference } from "../src/chat-push-state.ts";

const events = [
  "accept-success",
  "accept-blocked",
  "accept-failed",
  "dismiss",
] as const;

test("an unanswered prompt settles to the accept outcome", () => {
  assert.equal(nextPromptPreference("unset", "accept-success"), "enabled");
  assert.equal(nextPromptPreference("unset", "accept-blocked"), "blocked");
  assert.equal(nextPromptPreference("unset", "accept-failed"), "unset");
  assert.equal(nextPromptPreference("unset", "dismiss"), "dismissed");
});

test("a failed accept leaves the prompt eligible to be asked again", () => {
  const retried = nextPromptPreference("unset", "accept-failed");
  assert.equal(retried, "unset");
  assert.equal(nextPromptPreference(retried, "accept-success"), "enabled");
  assert.equal(nextPromptPreference(retried, "dismiss"), "dismissed");
});

test("a dismissed prompt never returns to unanswered but can still enable", () => {
  assert.equal(nextPromptPreference("dismissed", "accept-success"), "enabled");
  assert.equal(nextPromptPreference("dismissed", "accept-blocked"), "blocked");
  assert.equal(nextPromptPreference("dismissed", "accept-failed"), "dismissed");
  assert.equal(nextPromptPreference("dismissed", "dismiss"), "dismissed");
});

test("enabled and blocked are terminal for every event", () => {
  for (const event of events) {
    assert.equal(nextPromptPreference("enabled", event), "enabled");
    assert.equal(nextPromptPreference("blocked", event), "blocked");
  }
});
