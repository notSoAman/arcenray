import assert from "node:assert/strict";
import test from "node:test";
import process from "node:process";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants.js";
import config from "../../next.config.js";
import { assertMediaBuildConfig } from "./build-config.mjs";

test("production compilation refuses the missing media origin that broke browser playback", () => {
  const previous = process.env.NEXT_PUBLIC_MEDIA_URL;
  delete process.env.NEXT_PUBLIC_MEDIA_URL;
  try {
    assert.throws(
      () => config(PHASE_PRODUCTION_BUILD),
      /Set NEXT_PUBLIC_MEDIA_URL/,
    );
    assert.doesNotThrow(() => config(PHASE_DEVELOPMENT_SERVER));
    process.env.NEXT_PUBLIC_MEDIA_URL = "https://cdn.arcenray.com";
    assert.doesNotThrow(() => config(PHASE_PRODUCTION_BUILD));
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_MEDIA_URL;
    else process.env.NEXT_PUBLIC_MEDIA_URL = previous;
  }
});

test("build rejects placeholder or unsafe media origins", () => {
  for (const value of [
    undefined,
    "",
    "invalid",
    "https://cdn.example.com",
    "http://cdn.arcenray.com",
    "https://user:pass@cdn.arcenray.com",
    "https://cdn.arcenray.com/path",
    "https://cdn.arcenray.com/?token=abc",
  ]) {
    assert.throws(() => assertMediaBuildConfig(value));
  }
  assert.doesNotThrow(() =>
    assertMediaBuildConfig("https://cdn.arcenray.com/"),
  );
});
