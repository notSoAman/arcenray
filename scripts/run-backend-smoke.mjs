import { execFileSync, spawnSync } from "node:child_process";

// Explicit live test: creates and removes disposable users and media.
// Secrets stay in the child environment and never appear in argv or logs.
process.loadEnvFile(".env.test");
const env = { ...process.env };
env.R2_BUCKET_NAME ||= "arcenray-media";
env.R2_UPLOAD_BUCKET_NAME ||= "arcenray-uploads";
env.R2_PUBLIC_URL ||= "https://cdn.arcenray.com";
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  const output = execFileSync(
    "pnpm",
    [
      "exec",
      "supabase",
      "projects",
      "api-keys",
      "--project-ref",
      env.SUPABASE_PROJECT_REF,
      "--output",
      "json",
    ],
    { encoding: "utf8" },
  );
  const keys = JSON.parse(output);
  env.SUPABASE_SERVICE_ROLE_KEY = keys.find(
    (key) => key.name === "service_role",
  )?.api_key;
}
for (const name of [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
]) {
  if (!env[name]) throw new Error(`Missing ${name}`);
}
const result = spawnSync("python3", ["-u", "scripts/backend-smoke.py"], {
  env,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
