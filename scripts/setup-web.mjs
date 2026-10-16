import { readFile, writeFile } from "node:fs/promises";
const config = JSON.parse(
  await readFile(
    new URL("../docs/backend/project.json", import.meta.url),
    "utf8",
  ),
);
const target = new URL("../apps/web/.env.local", import.meta.url);
try {
  await writeFile(
    target,
    `NEXT_PUBLIC_SUPABASE_URL=${config.supabaseUrl}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${config.publishableKey}\nNEXT_PUBLIC_MEDIA_URL=${config.mediaUrl}\n`,
    { flag: "wx" },
  );
  console.log("Created apps/web/.env.local with public configuration only.");
} catch (error) {
  if (error.code === "EEXIST")
    console.log("apps/web/.env.local already exists; preserved.");
  else throw error;
}
