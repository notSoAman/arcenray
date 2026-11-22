import type { ConfigContext, ExpoConfig } from "expo/config";
import { mobileReleaseConfig } from "./src/release-config.ts";

export default ({ config }: ConfigContext): ExpoConfig => {
  const release = mobileReleaseConfig({
    variant: process.env.APP_VARIANT,
    channel: process.env.EXPO_UPDATE_CHANNEL,
    projectId: config.extra?.eas.projectId,
  });

  const googleServicesFile = process.env.ARCENRAY_ANDROID_GOOGLE_SERVICES_FILE;

  return {
    ...config,
    name: config.name ?? "Arcenray",
    slug: config.slug ?? "arcenray",
    icon: "./assets/icon.png",
    scheme: release.scheme,
    runtimeVersion: release.runtimeVersion,
    updates: release.updates,
    plugins: [
      ...(config.plugins ?? []),
      [
        "expo-notifications",
        {
          defaultChannel: "chat-messages",
          color: "#C2234B",
          icon: "./assets/notification-icon.png",
          largeIcon: "./assets/notification-large-icon.png",
        },
      ],
    ],
    android: {
      ...config.android,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon-safe-zone.png",
        backgroundColor: "#0E0F0E",
      },
      package: release.android.package,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    extra: {
      ...config.extra,
      chatPushEnabled: release.chatPushEnabled,
      // Public Google OAuth client ID for native Credential Manager sign-in.
      EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID:
        process.env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID ??
        config.extra?.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID ??
        null,
    },
  };
};
