import { readConfig } from "./config.ts";

/** Pure configuration so builds and OTA exports cannot silently use different identities. */
export function mobileReleaseConfig({
  variant,
  channel,
  projectId,
}: {
  variant?: string;
  channel?: string;
  projectId: string;
}) {
  const production = variant === "production";
  const selected = channel || (production ? "production" : "development");
  if (!["development", "preview", "production"].includes(selected))
    throw new Error("Unknown Expo update channel.");
  if (!production && selected !== "development")
    throw new Error("Release update channels require the production variant.");
  return {
    scheme: production ? "arcenray" : "arcenray-dev",
    chatPushEnabled: production,
    android: {
      package: production ? "com.arcenray.mobile" : "com.arcenray.mobile.dev",
    },
    runtimeVersion: { policy: "fingerprint" as const },
    updates: {
      url: `https://u.expo.dev/${projectId}`,
      checkAutomatically: "ON_LOAD" as const,
      fallbackToCacheTimeout: 0,
      requestHeaders: { "expo-channel-name": selected },
    },
  };
}

/** Fail before publishing a bundle without the public settings needed by real users. */
export function assertMobileReleaseEnvironment(
  env: Record<string, string | undefined>,
) {
  const config = readConfig({
    supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseKey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    clerkKey: env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    mediaUrl: env.EXPO_PUBLIC_MEDIA_URL,
  });
  if (!config.backend || !config.clerkKey || !config.mediaOrigin)
    throw new Error(
      "Missing or unsafe mobile public configuration. Check the selected EAS environment; never use server keys.",
    );
}
