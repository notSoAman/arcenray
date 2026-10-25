import assert from "node:assert/strict";
import test from "node:test";
import { createMobileApi, loadPublicFilms } from "../src/api.ts";
import { publicMediaUrl, readConfig } from "../src/config.ts";

const backend = {
  url: "https://development.example",
  key: "sb_publishable_fixture",
};

test("configuration accepts publishable Clerk keys and rejects server keys and unsafe origins", () => {
  assert.equal(
    readConfig({ supabaseUrl: backend.url, supabaseKey: "sb_secret_fixture" })
      .backend,
    null,
  );
  assert.equal(
    readConfig({ clerkKey: "pk_live_fixture" }).clerkKey,
    "pk_live_fixture",
  );
  assert.equal(readConfig({ clerkKey: "sk_live_fixture" }).clerkKey, null);
  for (const url of [
    "http://example.test",
    "https://user:pass@example.test",
    "https://example.test/path",
    "not-a-url",
  ]) {
    assert.equal(
      readConfig({ supabaseUrl: url, supabaseKey: backend.key }).backend,
      null,
    );
  }
  assert.deepEqual(
    readConfig({ supabaseUrl: backend.url, supabaseKey: backend.key }).backend,
    backend,
  );
});

test("media keys cannot escape the configured public media origin", () => {
  for (const key of [
    "../private.mp4",
    "https://evil.test/a",
    "/a.webp",
    "a//b",
    "a/%2e%2e/b",
  ]) {
    assert.equal(publicMediaUrl("https://media.example", key), null);
  }
  assert.equal(publicMediaUrl(null, "posters/a.webp"), null);
  assert.equal(
    publicMediaUrl("https://media.example", "posters/a.webp"),
    "https://media.example/posters/a.webp",
  );
});

test("public browsing reuses the shared feed RPC without a user token or event writes", async () => {
  let requests = 0;
  const api = createMobileApi(backend, undefined, async (input, init) => {
    requests++;
    assert.equal(
      String(input),
      `${backend.url}/rest/v1/rpc/get_personalized_feed`,
    );
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("apikey"), backend.key);
    assert.equal(headers.get("authorization"), `Bearer ${backend.key}`);
    assert.deepEqual(JSON.parse(String(init?.body)), {
      p_limit: 20,
      p_offset: 0,
    });
    return new Response(
      JSON.stringify([
        {
          id: "public",
          status: "published",
          title: "Public film",
          synopsis: "A short film",
          genres: [],
          duration_seconds: 60,
          poster_key: null,
          owner_id: "not-for-card",
        },
        { id: "draft", status: "draft", title: "Private draft" },
      ]),
      { headers: { "content-type": "application/json" } },
    );
  });
  const films = await loadPublicFilms(api);
  assert.equal(requests, 1);
  assert.equal(films.length, 1);
  assert.equal(films[0]?.title, "Public film");
  assert.equal("owner_id" in films[0]!, false);
});

test("authenticated SDK uses Clerk token and resolves app UUID through the existing RPC", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const api = createMobileApi(
    backend,
    async () => "clerk-session-fixture",
    async (input, init) => {
      assert.equal(
        String(input),
        `${backend.url}/rest/v1/rpc/current_profile_id`,
      );
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer clerk-session-fixture",
      );
      return new Response(JSON.stringify(id), {
        headers: { "content-type": "application/json" },
      });
    },
  );
  assert.equal(await api.viewer.id(), id);
});

test("feed errors stay errors instead of becoming an empty catalog", async () => {
  const api = createMobileApi(
    backend,
    undefined,
    async () =>
      new Response(JSON.stringify({ message: "Unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
  );
  await assert.rejects(loadPublicFilms(api), /Could not load films/);
});
