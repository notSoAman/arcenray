import assert from "node:assert/strict";
import test from "node:test";
import { focusedFieldScrollOffset } from "../src/keyboard-layout.ts";
test("focused field moves above the open keyboard including its label", () => {
  assert.equal(
    focusedFieldScrollOffset({
      offset: 100,
      fieldTop: 650,
      fieldHeight: 56,
      viewportTop: 24,
      viewportBottom: 800,
      keyboardTop: 460,
    }),
    366,
  );
});
test("Android resize and overlay modes both respect the real keyboard edge", () => {
  const field = {
    offset: 100,
    fieldTop: 650,
    fieldHeight: 56,
    viewportTop: 24,
    keyboardTop: 460,
  };
  assert.equal(
    focusedFieldScrollOffset({ ...field, viewportBottom: 460 }),
    366,
  );
  assert.equal(
    focusedFieldScrollOffset({ ...field, viewportBottom: 800 }),
    366,
  );
});
test("visible fields do not jump, and fields above the viewport can be recovered", () => {
  assert.equal(
    focusedFieldScrollOffset({
      offset: 100,
      fieldTop: 320,
      fieldHeight: 56,
      viewportTop: 24,
      viewportBottom: 800,
      keyboardTop: 460,
    }),
    100,
  );
  assert.equal(
    focusedFieldScrollOffset({
      offset: 100,
      fieldTop: 10,
      fieldHeight: 56,
      viewportTop: 24,
      viewportBottom: 800,
      keyboardTop: 460,
    }),
    66,
  );
});
