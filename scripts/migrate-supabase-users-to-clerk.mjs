// Founder-only, non-destructive import. Default is a counts-only dry run.
// Source hashes stay in memory and are sent only to the selected Clerk instance.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
process.loadEnvFile("apps/web/.env.local");
const app = "app_3KbaRFRlbAzVcY92i69x6LttYRK";
const ref = "ropbxsnjtejfomnpdllf";
const secret = process.env.CLERK_SECRET_KEY;
if (!secret?.startsWith("sk_test_"))
  throw new Error(
    "This migration targets the selected development instance only",
  );
const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const issuer =
  "https://" +
  Buffer.from(key.split("_").slice(2).join("_"), "base64")
    .toString()
    .replace(/\$$/, "");
if (!/^https:\/\/[a-z0-9-]+\.clerk\.accounts\.dev$/.test(issuer))
  throw new Error("Unexpected issuer");
const config = readFileSync("supabase/config.toml", "utf8");
if (!config.includes(new URL(issuer).hostname))
  throw new Error(
    "Clerk issuer does not match reviewed database configuration",
  );
function cli(args) {
  try {
    return execFileSync("pnpm", ["exec", "supabase", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error("Supabase command failed; sensitive output withheld");
  }
}
function sql(query) {
  return JSON.parse(cli(["db", "query", "--linked", query])).rows;
}
const users = sql(
  "select u.id,u.email,u.encrypted_password,u.email_confirmed_at,p.handle,(select array_agg(distinct i.provider) from auth.identities i where i.user_id=u.id) as providers from auth.users u join public.profiles p on p.id=u.id order by u.created_at;",
);
for (const user of users) {
  if (
    !user.email ||
    !/^\$2[aby]\$\d\d\$/.test(user.encrypted_password) ||
    user.providers?.some((p) => p !== "email")
  )
    throw new Error(
      "Manual migration required for a non-email/bcrypt account; nothing imported",
    );
}
console.log(
  JSON.stringify({
    app,
    projectRef: ref,
    accounts: users.length,
    verifiedEmail: users.filter((u) => u.email_confirmed_at).length,
    unverifiedEmail: users.filter((u) => !u.email_confirmed_at).length,
    passwordHandling: "bcrypt hashes preserved; never plaintext",
    destructive: false,
  }),
);
if (!process.argv.includes("--apply")) process.exit(0);
const expected = Number(
  process.argv[process.argv.indexOf("--expected-count") + 1],
);
if (expected !== users.length)
  throw new Error("Reviewed expected account count must match before import");
async function clerk(path, body) {
  const response = await fetch("https://api.clerk.com/v1" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + secret,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const codes = (failure.errors ?? []).map((e) => ({
      code: e.code,
      parameter: e.meta?.param_name,
    }));
    throw new Error(
      `Clerk import HTTP ${response.status}; validation ${JSON.stringify(codes)}. Sensitive response withheld.`,
    );
  }
  return response.json();
}
const keys = JSON.parse(
  cli(["projects", "api-keys", "--project-ref", ref, "--output", "json"]),
);
const service = keys.find((k) => k.name === "service_role")?.api_key;
if (!service) throw new Error("Server migration credential unavailable");
let imported = 0;
for (const user of users) {
  const filter = new URLSearchParams({ external_id: user.id });
  const found = await clerk("/users?" + filter);
  let target = (Array.isArray(found) ? found : found.data)?.[0];
  if (!target) {
    const byEmail = await clerk(
      "/users?" + new URLSearchParams({ email_address: user.email }),
    );
    if ((Array.isArray(byEmail) ? byEmail : byEmail.data)?.length)
      throw new Error(
        "An existing Clerk email needs manual ownership reconciliation; no automatic merge",
      );
    target = await clerk("/users", {
      external_id: user.id,
      email_address: [user.email],
      email_address_identification_status: [
        user.email_confirmed_at ? "verified" : "reserved",
      ],
      password_digest: user.encrypted_password,
      password_hasher: "bcrypt",
      ...(user.handle.length >= 4 && user.handle.length <= 64
        ? { username: user.handle }
        : {}),
    });
  }
  if (target.external_id !== user.id || !/^user_[A-Za-z0-9]+$/.test(target.id))
    throw new Error("Imported external identity mismatch");
  const email = target.email_addresses?.find(
    (e) => e.email_address.toLowerCase() === user.email.toLowerCase(),
  );
  if (
    !email ||
    Boolean(user.email_confirmed_at) !==
      (email.verification?.status === "verified")
  )
    throw new Error(
      "Email verification state must not be upgraded during import",
    );
  const existing = sql(
    `select subject from private.auth_identities where issuer='${issuer}' and profile_id='${user.id}'::uuid;`,
  );
  if (existing.length && existing[0].subject !== target.id)
    throw new Error("Existing profile identity conflict");
  if (!existing.length) {
    const response = await fetch(
      `https://${ref}.supabase.co/rest/v1/rpc/backend_link_identity`,
      {
        method: "POST",
        headers: {
          apikey: service,
          Authorization: "Bearer " + service,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_issuer: issuer,
          p_subject: target.id,
          p_profile: user.id,
        }),
      },
    );
    if (!response.ok)
      throw new Error(
        `Identity mapping HTTP ${response.status}; original account is retained. Resume this script to finish.`,
      );
  }
  imported++;
}
console.log(
  `Imported/linked ${imported} existing accounts with original profile UUIDs; legacy accounts were not deleted.`,
);
