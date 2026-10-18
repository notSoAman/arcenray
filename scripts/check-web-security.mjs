// Checks a locally running production build, without cookies or credentials.
const base = new URL(
  process.env.ARCENRAY_WEB_TEST_URL || "http://localhost:3001",
);
if (!["localhost", "127.0.0.1"].includes(base.hostname))
  throw new Error("Local test URL required");
const pages = await Promise.all(
  [0, 1].map(() => fetch(new URL("/home", base), { redirect: "manual" })),
);
const nonces = [];
for (const response of pages) {
  if (response.status !== 200)
    throw new Error("Guest home did not render: " + response.status);
  const csp = response.headers.get("content-security-policy") || "";
  if (csp.includes("'unsafe-eval'") || !csp.includes("'strict-dynamic'"))
    throw new Error("Production script policy missing");
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  if (!nonce) throw new Error("Request nonce missing");
  nonces.push(nonce);
  for (const [name, value] of [
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", "DENY"],
  ])
    if (response.headers.get(name) !== value)
      throw new Error("Missing " + name);
  const html = await response.text();
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  if (
    !scripts.length ||
    scripts.some(([, attributes]) => !attributes.includes(`nonce="${nonce}"`))
  )
    throw new Error("SSR script nonce mismatch");
  if (html.includes("nextjs-portal"))
    throw new Error("Development indicator in production HTML");
}
if (nonces[0] === nonces[1]) throw new Error("Nonce reused across requests");
const checks = [
  [
    "/api/account/delete",
    { origin: "https://attacker.invalid", "content-type": "application/json" },
    JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
    [403],
  ],
  [
    "/api/account/delete",
    { origin: base.origin, "content-type": "application/json" },
    JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
    [401],
  ],
  [
    "/api/account/delete",
    { origin: base.origin, "content-type": "application/json" },
    "x".repeat(4097),
    [400],
  ],
  [
    "/api/webhooks/clerk",
    { "content-type": "application/json" },
    "{}",
    [400, 503],
  ],
];
for (const [path, headers, body, statuses] of checks) {
  const response = await fetch(new URL(path, base), {
    method: "POST",
    headers,
    body,
    redirect: "manual",
  });
  if (!statuses.includes(response.status))
    throw new Error(path + " unexpected " + response.status);
}
console.log(
  "PASS production headers, unique SSR nonces, guest home, deletion request boundaries and unsigned webhook denial",
);
