import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFilmLink } from "./film-link.ts";

test("external films accept canonical provider URLs without fetching media", () => {
  for (const url of [
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10",
    "https://youtube.com/shorts/dQw4w9WgXcQ",
  ]) {
    assert.deepEqual(parseFilmLink(url), {
      source: "youtube_embed",
      provider_id: "dQw4w9WgXcQ",
    });
  }
  for (const url of [
    "https://vimeo.com/123456789",
    "https://player.vimeo.com/video/123456789",
  ])
    assert.deepEqual(parseFilmLink(url), {
      source: "vimeo_embed",
      provider_id: "123456789",
    });
});
test("external film links reject unsafe or unsupported locations and IDs", () => {
  for (const url of [
    "http://vimeo.com/123",
    "https://vimeo.com.evil.test/123",
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
    "https://user:password@vimeo.com/123",
    "javascript:alert(1)",
    "https://localhost/123",
    "https://youtube.com/watch?v=short",
    "https://vimeo.com/not-a-video",
    "https://youtu.be/dQw4w9WgXcQ/extra",
    "//vimeo.com/123",
  ])
    assert.throws(() => parseFilmLink(url), url);
});
