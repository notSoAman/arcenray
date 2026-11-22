import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as release from "../src/release-config.ts";

const projectId = "68a21561-8def-4dff-b6b8-e686e7c3a2c4";
const require = createRequire(new URL("../package.json", import.meta.url));

test("Expo consumes the static config through its dynamic config input", () => {
  const { getConfig } = require(
    require.resolve("@expo/config", {
      paths: [require.resolve("expo/package.json")],
    }),
  );
  const config = getConfig(new URL("..", import.meta.url).pathname);
  assert.equal(config.hasUnusedStaticConfig, false);
  assert.equal(config.exp.name, "Arcenray");
  assert.equal(config.exp.extra.eas.projectId, projectId);
  assert.ok(config.exp.plugins.includes("expo-router"));
  const notifications = config.exp.plugins.find(
    (plugin: unknown) =>
      Array.isArray(plugin) && plugin[0] === "expo-notifications",
  );
  assert.deepEqual(notifications?.[1], {
    defaultChannel: "chat-messages",
    color: "#C2234B",
    icon: "./assets/notification-icon.png",
    largeIcon: "./assets/notification-large-icon.png",
  });
});

test("push support follows the release identity instead of an EAS-only file path", async () => {
  const { default: createConfig } = await import("../app.config.ts");
  const createExpoConfig = createConfig as (
    context: Pick<Parameters<typeof createConfig>[0], "config">,
  ) => ReturnType<typeof createConfig>;
  const baseConfig = JSON.parse(
    readFileSync(new URL("../app.json", import.meta.url), "utf8"),
  ).expo;
  const previousVariant = process.env.APP_VARIANT;
  const previousChannel = process.env.EXPO_UPDATE_CHANNEL;
  const previousGoogleServicesFile =
    process.env.ARCENRAY_ANDROID_GOOGLE_SERVICES_FILE;

  try {
    process.env.APP_VARIANT = "production";
    process.env.EXPO_UPDATE_CHANNEL = "production";
    delete process.env.ARCENRAY_ANDROID_GOOGLE_SERVICES_FILE;
    const withoutMountedFile = createExpoConfig({ config: baseConfig });

    process.env.ARCENRAY_ANDROID_GOOGLE_SERVICES_FILE =
      "/tmp/google-services.json";
    const withMountedFile = createExpoConfig({ config: baseConfig });

    assert.equal(withoutMountedFile.extra?.chatPushEnabled, true);
    assert.equal(withMountedFile.extra?.chatPushEnabled, true);
  } finally {
    if (previousVariant === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previousVariant;
    if (previousChannel === undefined) delete process.env.EXPO_UPDATE_CHANNEL;
    else process.env.EXPO_UPDATE_CHANNEL = previousChannel;
    if (previousGoogleServicesFile === undefined)
      delete process.env.ARCENRAY_ANDROID_GOOGLE_SERVICES_FILE;
    else
      process.env.ARCENRAY_ANDROID_GOOGLE_SERVICES_FILE =
        previousGoogleServicesFile;
  }
});

test("audio native peers are direct dependencies for standalone builds", () => {
  const pkg = require("./package.json");
  const audio = require("expo-audio/package.json");
  for (const peer of Object.keys(audio.peerDependencies)) {
    if (audio.peerDependenciesMeta?.[peer]?.optional) continue;
    assert.ok(
      pkg.dependencies[peer],
      `Missing direct native audio peer: ${peer}`,
    );
    assert.ok(require.resolve(`${peer}/package.json`));
  }
});

test("store builds and updates share production identity and fingerprint compatibility", () => {
  const config = release.mobileReleaseConfig({
    variant: "production",
    projectId,
  });
  assert.equal(config.android.package, "com.arcenray.mobile");
  assert.equal(config.chatPushEnabled, true);
  assert.equal(config.scheme, "arcenray");
  assert.deepEqual(config.runtimeVersion, { policy: "fingerprint" });
  assert.equal(
    config.updates.url,
    "https://u.expo.dev/68a21561-8def-4dff-b6b8-e686e7c3a2c4",
  );
  assert.equal(
    config.updates.requestHeaders["expo-channel-name"],
    "production",
  );
  assert.equal(config.updates.checkAutomatically, "ON_LOAD");
  assert.equal(config.updates.fallbackToCacheTimeout, 0);
});

test("preview uses the release package but cannot read the production update channel", () => {
  const config = release.mobileReleaseConfig({
    variant: "production",
    channel: "preview",
    projectId,
  });
  assert.equal(config.android.package, "com.arcenray.mobile");
  assert.equal(config.updates.requestHeaders["expo-channel-name"], "preview");
});

test("development retains its separate identity and cannot accidentally consume production updates", () => {
  const config = release.mobileReleaseConfig({ projectId });
  assert.equal(config.android.package, "com.arcenray.mobile.dev");
  assert.equal(config.chatPushEnabled, false);
  assert.equal(config.scheme, "arcenray-dev");
  assert.equal(
    config.updates.requestHeaders["expo-channel-name"],
    "development",
  );
  assert.throws(
    () => release.mobileReleaseConfig({ channel: "production", projectId }),
    /production variant/,
  );
});

test("unknown update channels fail closed instead of silently routing a release", () => {
  assert.throws(
    () =>
      release.mobileReleaseConfig({
        variant: "production",
        channel: "prodution",
        projectId,
      }),
    /channel/,
  );
});

test("native store automation increments the remote version and submits only to an explicit track", () => {
  const eas = JSON.parse(
    readFileSync(new URL("../eas.json", import.meta.url), "utf8"),
  );
  assert.equal(eas.cli.appVersionSource, "remote");
  assert.equal(eas.build.production.autoIncrement, true);
  assert.equal(eas.build.production.node, "24.18.0");
  assert.equal(eas.build.production.pnpm, "11.25.0");
  for (const track of ["internal", "alpha", "beta", "production"]) {
    assert.equal(
      eas.submit[track].android.applicationId,
      "com.arcenray.mobile",
    );
    assert.equal(eas.submit[track].android.track, track);
  }
  assert.equal(eas.submit.default, undefined);
  assert.equal(
    eas.submit["closed-testing"].android.track,
    "Arcenray Closed Testing",
  );
});

test("release validation refuses missing or privileged client configuration before publishing", () => {
  const env = {
    EXPO_PUBLIC_SUPABASE_URL: "https://backend.example",
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_fixture",
    EXPO_PUBLIC_MEDIA_URL: "https://media.example",
  };
  assert.doesNotThrow(() => release.assertMobileReleaseEnvironment(env));
  for (const field of Object.keys(env)) {
    assert.throws(
      () =>
        release.assertMobileReleaseEnvironment({ ...env, [field]: undefined }),
      /public configuration/,
    );
  }
  assert.throws(
    () =>
      release.assertMobileReleaseEnvironment({
        ...env,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_fixture",
      }),
    /public configuration/,
  );
  assert.throws(
    () =>
      release.assertMobileReleaseEnvironment({
        ...env,
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "sk_live_fixture",
      }),
    /public configuration/,
  );
});
