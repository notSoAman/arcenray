import { test } from "node:test";
import assert from "node:assert/strict";
import {
  safeNextPath,
  profileInputSchema,
  uploadSchema,
  filmDraftSchema,
} from "./contracts.ts";

test("auth redirect rejects external and escaped destinations", () => {
  for (const value of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%2f%2fevil.example",
    "/%5cevil.example",
    "/\nevil.example",
    "/%zz",
  ])
    assert.equal(safeNextPath(value), "/");
  assert.equal(safeNextPath("/films?genre=drama"), "/films?genre=drama");
});
test("profile contract rejects privilege fields and invalid handles", () => {
  const valid = {
    handle: "film_maker",
    full_name: "Film Maker",
    bio: "",
    roles: ["editor", "composer"],
    location_city: null,
    skills_gear: [],
  };
  assert.equal(profileInputSchema.safeParse(valid).success, true);
  assert.equal(
    profileInputSchema.safeParse({ ...valid, storage_quota_bytes: 999 })
      .success,
    false,
  );
  assert.equal(
    profileInputSchema.safeParse({ ...valid, handle: "Bad Handle" }).success,
    false,
  );
});
test("upload validation rejects quota overflow and mismatched MIME", () => {
  assert.equal(
    uploadSchema.safeParse({
      kind: "hook",
      bytes: 100,
      content_type: "video/mp4",
    }).success,
    true,
  );
  assert.equal(
    uploadSchema.safeParse({
      kind: "hook",
      bytes: 100,
      content_type: "image/webp",
    }).success,
    false,
  );
  assert.equal(
    uploadSchema.safeParse({
      kind: "film",
      bytes: 2 * 1024 ** 3 + 1,
      content_type: "video/mp4",
    }).success,
    false,
  );
});
test("external draft cannot smuggle a native asset or arbitrary URL", () => {
  const base = {
    title: "Film",
    synopsis: "",
    genres: [],
    mood_tags: [],
    location_city: null,
    language: null,
    source: "youtube_embed",
    provider_id: "dQw4w9WgXcQ",
    film_asset_id: null,
    hook_asset_id: null,
    poster_asset_id: null,
  };
  assert.equal(filmDraftSchema.safeParse(base).success, true);
  assert.equal(
    filmDraftSchema.safeParse({ ...base, provider_id: "https://evil.example" })
      .success,
    false,
  );
});
