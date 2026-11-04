import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";

const mobileRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const variables = [
  "ARCENRAY_UPLOAD_STORE_FILE",
  "ARCENRAY_UPLOAD_STORE_PASSWORD",
  "ARCENRAY_UPLOAD_KEY_ALIAS",
  "ARCENRAY_UPLOAD_KEY_PASSWORD",
];
for (const name of variables) {
  if (!process.env[name])
    throw new Error(`${name} is required for a Play bundle`);
}
if (!existsSync(process.env[variables[0]]))
  throw new Error("The Android upload keystore file is missing");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(
  process.execPath,
  [
    join(mobileRoot, "node_modules/expo/bin/cli"),
    "prebuild",
    "--platform",
    "android",
    "--no-install",
  ],
  mobileRoot,
);

// Do not ship a recorder whose microphone permission was blocked by another plugin.
const manifest = readFileSync(
  join(mobileRoot, "android/app/src/main/AndroidManifest.xml"),
  "utf8",
);
const microphone = manifest.match(
  /<uses-permission\b[^>]*android:name="android.permission.RECORD_AUDIO"[^>]*>/,
)?.[0];
if (!microphone || microphone.includes('tools:node="remove"')) {
  throw new Error(
    "Android microphone permission is blocked; regenerate the native project before release.",
  );
}

// Expo regenerates android/ from app.json. Keep signing credentials outside Git and
// replace only the generated release signing stanza after each prebuild.
const gradleFile = join(mobileRoot, "android/app/build.gradle");
let gradle = readFileSync(gradleFile, "utf8");
const signingStart = gradle.indexOf("    signingConfigs {");
const buildTypesStart = gradle.indexOf("    buildTypes {", signingStart);
if (signingStart < 0 || buildTypesStart < 0)
  throw new Error(
    "Expo's Android signing template changed; review it before building",
  );
const signingBlock = gradle.slice(signingStart, buildTypesStart);
if (!signingBlock.includes("        release {")) {
  const releaseConfig = `        release {
            storeFile file(System.getenv("ARCENRAY_UPLOAD_STORE_FILE"))
            storePassword System.getenv("ARCENRAY_UPLOAD_STORE_PASSWORD")
            keyAlias System.getenv("ARCENRAY_UPLOAD_KEY_ALIAS")
            keyPassword System.getenv("ARCENRAY_UPLOAD_KEY_PASSWORD")
        }
`;
  gradle =
    gradle
      .slice(0, buildTypesStart)
      .replace(/\n[ ]{4}}\s*$/, `\n${releaseConfig}    }\n`) +
    gradle.slice(buildTypesStart);
}
const releaseStart = gradle.indexOf(
  "        release {",
  gradle.indexOf("    buildTypes {"),
);
const releaseEnd = gradle.indexOf("\n        }", releaseStart);
if (releaseStart < 0 || releaseEnd < 0)
  throw new Error(
    "Expo's Android release template changed; review it before building",
  );
const releaseBlock = gradle.slice(releaseStart, releaseEnd);
if (
  !releaseBlock.includes("signingConfig signingConfigs.debug") &&
  !releaseBlock.includes("signingConfig signingConfigs.release")
)
  throw new Error(
    "Expo's Android release signing line changed; review it before building",
  );
gradle =
  gradle.slice(0, releaseStart) +
  releaseBlock.replace(
    "signingConfig signingConfigs.debug",
    "signingConfig signingConfigs.release",
  ) +
  gradle.slice(releaseEnd);
writeFileSync(gradleFile, gradle);

run(
  "./gradlew",
  [
    ":app:bundleRelease",
    "-PreactNativeArchitectures=armeabi-v7a,arm64-v8a",
    "--max-workers=2",
  ],
  join(mobileRoot, "android"),
);
const output = join(
  mobileRoot,
  "android/app/build/outputs/bundle/release/app-release.aab",
);
if (!existsSync(output))
  throw new Error("Gradle completed without an Android App Bundle");
const signature = spawnSync("jarsigner", ["-verify", output], {
  cwd: mobileRoot,
  encoding: "utf8",
});
if (signature.error) throw signature.error;
if (signature.status !== 0 || !signature.stdout.includes("jar verified."))
  throw new Error("The Android App Bundle signature could not be verified");
process.stdout.write(`Signed Play bundle: ${output}\n`);
