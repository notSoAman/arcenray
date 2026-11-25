import assert from "node:assert/strict";
import test from "node:test";
import {
  handleIssue,
  nextVibeSelection,
  skillsHint,
  vibeInstruction,
} from "./steps.ts";

test("vibe picks toggle on and off before the limit", () => {
  assert.deepEqual(nextVibeSelection([], "atmospheric"), ["atmospheric"]);
  assert.deepEqual(nextVibeSelection(["atmospheric", "intimate"], "intimate"), [
    "atmospheric",
  ]);
  assert.deepEqual(nextVibeSelection(["atmospheric"], "intimate"), [
    "atmospheric",
    "intimate",
  ]);
});

test("a fourth pick is locked; deselecting a card frees a slot", () => {
  const full = ["atmospheric", "intimate", "musical"];
  assert.deepEqual(nextVibeSelection(full, "kinetic"), full);
  assert.deepEqual(nextVibeSelection(full, "intimate"), [
    "atmospheric",
    "musical",
  ]);
  assert.deepEqual(nextVibeSelection(["atmospheric", "musical"], "kinetic"), [
    "atmospheric",
    "musical",
    "kinetic",
  ]);
});

test("vibe instruction states the exact requirement, live count and locked hint", () => {
  assert.equal(vibeInstruction(0, 12), "Choose exactly 3 of 12 interests.");
  assert.equal(
    vibeInstruction(2, 12),
    "Choose exactly 3 of 12 interests. 2 of 3 chosen.",
  );
  assert.equal(
    vibeInstruction(3, 12),
    "Choose exactly 3 of 12 interests. 3 of 3 chosen. Deselect a card to change your choices.",
  );
});

test("handle feedback stays quiet while empty or valid and explains invalid handles", () => {
  assert.equal(handleIssue(""), null);
  assert.equal(handleIssue("aman_singh"), null);
  assert.notEqual(handleIssue("ab"), null);
  assert.notEqual(handleIssue("Bad Handle!"), null);
  assert.match(handleIssue("ab") ?? "", /lowercase/);
});

test("skills hint reports progress against the limit", () => {
  assert.match(skillsHint(0, 30), /Enter or comma/);
  assert.match(skillsHint(4, 30), /4 of 30/);
  assert.match(skillsHint(30, 30), /30 of 30/);
  assert.match(skillsHint(30, 30), /Remove one/);
});
