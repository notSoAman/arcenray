import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
for (const name of readdirSync("supabase/tests")
  .filter((name) => name.endsWith(".sql"))
  .sort()) {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "supabase",
      "db",
      "query",
      "--linked",
      "--file",
      "supabase/tests/" + name,
    ],
    { encoding: "utf8" },
  );
  let output;
  try {
    output = JSON.parse(result.stdout);
  } catch {
    throw new Error(name + ": no valid SQL test result");
  }
  // The CLI can return an error JSON with exit status zero; assert the result marker.
  if (
    result.status !== 0 ||
    !output.rows?.some(
      (row) =>
        typeof row.result === "string" && /assertions passed/i.test(row.result),
    )
  ) {
    process.stderr.write(name + ": FAILED\n");
    process.stderr.write(
      String(
        output.error?.message ??
          "Expected rolled-back assertion result missing",
      ) + "\n",
    );
    process.exit(1);
  }
  console.log("PASS " + name + " (fixtures rolled back)");
}
