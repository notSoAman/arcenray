import assert from "node:assert/strict";
import { test } from "node:test";
import { putBlob } from "./transport.ts";

test("a stalled PUT is aborted promptly and a progressing upload resets the idle deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let request!: FakeXHR;
  class FakeXHR {
    upload: {
      onprogress?: (event: { loaded: number }) => void;
      onload?: () => void;
    } = {};
    onload?: () => void;
    onabort?: () => void;
    status = 200;
    aborted = false;
    constructor() {
      request = this;
    }
    open() {}
    setRequestHeader() {}
    send() {}
    abort() {
      this.aborted = true;
      this.onabort?.();
    }
  }
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    "XMLHttpRequest",
  );
  Object.defineProperty(globalThis, "XMLHttpRequest", {
    configurable: true,
    value: FakeXHR,
  });
  try {
    const promise = putBlob(
      "https://example.invalid",
      {},
      new Blob(["film"]),
      new AbortController().signal,
      () => {},
    );
    const failure = assert.rejects(promise, /stopped responding/);
    t.mock.timers.tick(80_000);
    request.upload.onprogress?.({ loaded: 2 });
    t.mock.timers.tick(80_000);
    assert.equal(request.aborted, false);
    t.mock.timers.tick(10_001);
    await failure;
    assert.equal(request.aborted, true);
  } finally {
    t.mock.timers.reset();
    if (previous) Object.defineProperty(globalThis, "XMLHttpRequest", previous);
    else Reflect.deleteProperty(globalThis, "XMLHttpRequest");
  }
});
