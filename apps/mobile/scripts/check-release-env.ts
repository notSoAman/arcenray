import { assertMobileReleaseEnvironment } from "../src/release-config.ts";

if (process.env.EAS_BUILD_PROFILE === "development") {
  console.log(
    "Development client uses Metro's environment; release validation skipped.",
  );
} else {
  assertMobileReleaseEnvironment(process.env);
  console.log(
    "PASS mobile public release configuration (values not displayed)",
  );
}
