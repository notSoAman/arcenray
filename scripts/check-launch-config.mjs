// Read-only release inventory. Never prints secret values or changes resources.
import { existsSync } from "node:fs";
const file = process.argv[2];
if (!file || !existsSync(file))
  throw new Error(
    "Usage: node scripts/check-launch-config.mjs <private-production-env-file>",
  );
process.loadEnvFile(file);
const e = process.env;
const issues = [];
function requireValue(name) {
  if (!e[name] || /^(your-|replace-|generate-)/i.test(e[name]))
    issues.push(name + " missing");
}
for (const name of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_MEDIA_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_ISSUER",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLERK_WEBHOOK_SIGNING_SECRET",
  "SUPPORT_EMAIL",
  "CLOUDFLARE_ZONE_ID",
  "CLOUDFLARE_CACHE_PURGE_TOKEN",
])
  requireValue(name);
if (
  e.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  !e.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith("pk_live_")
)
  issues.push("Clerk public key is not production");
if (e.CLERK_SECRET_KEY && !e.CLERK_SECRET_KEY.startsWith("sk_live_"))
  issues.push("Clerk secret key is not production");
for (const name of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_MEDIA_URL",
  "CLERK_ISSUER",
]) {
  if (!e[name]) continue;
  try {
    const u = new URL(e[name]);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== "/"
    )
      throw Error();
  } catch {
    issues.push(name + " requires a clean HTTPS origin");
  }
}
if (
  e.SUPPORT_EMAIL &&
  !/^[^\s@<>?&#]+@[^\s@<>?&#]+\.[^\s@<>?&#]+$/.test(e.SUPPORT_EMAIL)
)
  issues.push("SUPPORT_EMAIL invalid");
if (e.CLERK_ISSUER?.endsWith(".accounts.dev"))
  issues.push("Clerk issuer is development");
if (issues.length) {
  console.error(
    "Launch configuration incomplete:\n" +
      issues.map((x) => "- " + x).join("\n"),
  );
  process.exitCode = 1;
} else
  console.log(
    "Configuration inventory passed. This does not verify provider setup, policies, recovery, hosted journeys or authorize deployment.",
  );
