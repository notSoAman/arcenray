import { spawnSync } from "node:child_process";
import { writeFile, rename } from "node:fs/promises";
const result = spawnSync(
  "pnpm",
  ["exec", "supabase", "gen", "types", "--linked", "--schema", "public"],
  { encoding: "utf8" },
);
if (result.status !== 0) {
  process.stderr.write(result.stderr || "Type generation failed\n");
  process.exit(result.status ?? 1);
}
if (!result.stdout.startsWith("export type Json"))
  throw new Error("Unexpected type generator output; existing types preserved");
const target = new URL(
  "../packages/shared/src/database.types.ts",
  import.meta.url,
);
const temp = new URL(
  "../packages/shared/src/database.types.ts.tmp",
  import.meta.url,
);
await writeFile(temp, result.stdout);
await rename(temp, target);
console.log("Updated generated public database types.");
