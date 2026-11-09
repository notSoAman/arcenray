import app from "./app.json";

const production = process.env.APP_VARIANT === "production";

export default {
  expo: {
    ...app.expo,
    icon: "./assets/icon.png",
    scheme: production ? "arcenray" : app.expo.scheme,
    android: {
      ...app.expo.android,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0E0F0E",
      },
      package: production ? "com.arcenray.mobile" : app.expo.android.package,
      versionCode: 2,
    },
  },
};
