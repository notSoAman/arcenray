import assert from "node:assert/strict";
import test from "node:test";
import { appCspDirectives, setupCsp } from "./security-policy.ts";

test("service policy permits data/realtime/direct media upload and legal player frames", () => {
  const policy = appCspDirectives(
    {
      supabaseUrl: "https://project.supabase.co",
      mediaUrl: "https://cdn.arcenray.com",
    },
    true,
  );
  assert.ok(policy["connect-src"].includes("https://project.supabase.co"));
  assert.ok(policy["connect-src"].includes("wss://project.supabase.co"));
  assert.ok(
    policy["connect-src"].includes("https://*.r2.cloudflarestorage.com"),
  );
  assert.deepEqual(policy["media-src"], [
    "'self'",
    "blob:",
    "https://cdn.arcenray.com",
  ]);
  assert.ok(policy["frame-src"].includes("https://www.youtube-nocookie.com"));
  assert.ok(policy["frame-src"].includes("https://player.vimeo.com"));
  assert.deepEqual(policy["frame-ancestors"], ["'none'"]);
  assert.deepEqual(policy["object-src"], ["'none'"]);
  assert.ok(!JSON.stringify(policy).includes("unsafe-eval"));
});

test("invalid or insecure service origins cannot inject or broaden production CSP", () => {
  for (const url of [
    "http://cdn.example.com",
    "http://localhost:54321",
    "https://user:pass@cdn.example.com",
    "https://cdn.example.com/path",
    "https://cdn.example.com/?x=y",
    "https://cdn.example.com/#x",
    "javascript:alert(1)",
    "https://example.com;script-src",
  ]) {
    assert.throws(() => appCspDirectives({ mediaUrl: url }, true), Error, url);
  }
  assert.ok(
    appCspDirectives({ supabaseUrl: "http://127.0.0.1:54321" }, false)[
      "connect-src"
    ].includes("ws://127.0.0.1:54321"),
  );
});

test("missing-key setup policy prevents framing/objects without blocking framework bootstrap", () => {
  assert.ok(setupCsp.includes("frame-ancestors 'none'"));
  assert.ok(setupCsp.includes("object-src 'none'"));
  assert.ok(!setupCsp.includes("script-src"));
});
