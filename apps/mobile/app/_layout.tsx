import "react-native-url-polyfill/auto";
import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ChatActivityProvider } from "../src/chat-activity";
import { ChatPushProvider } from "../src/chat-push";
import { SessionProvider } from "../src/session";
import { LogoMark } from "../src/brand";
import { colors, fonts } from "../src/theme";
import { AppUpdates } from "../src/app-updates";
import { useAppFonts } from "../src/fonts";

function FontSplash() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.void,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <LogoMark size={64} />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();

  if (!fontsLoaded && !fontError) return <FontSplash />;

  return (
    <AppUpdates fallback={<FontSplash />}>
      <SessionProvider>
        <StatusBar style="light" />
        <ChatPushProvider>
          <ChatActivityProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                headerStyle: { backgroundColor: colors.void },
                headerTintColor: colors.bone,
                headerShadowVisible: false,
                headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17 },
                contentStyle: { backgroundColor: colors.void },
                animation: "slide_from_right",
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(tabs)" options={{ animation: "none" }} />
              <Stack.Screen name="sign-in" options={{ animation: "fade" }} />
              <Stack.Screen name="film/[id]" />
              <Stack.Screen name="u/[handle]" />
              <Stack.Screen
                name="onboarding"
                options={{ headerShown: true, title: "Your profile" }}
              />
              <Stack.Screen
                name="publish"
                options={{ headerShown: true, title: "Publish" }}
              />
              <Stack.Screen
                name="settings"
                options={{ headerShown: true, title: "Settings" }}
              />
              <Stack.Screen name="chat/[id]" />
              <Stack.Screen name="+not-found" />
            </Stack>
          </ChatActivityProvider>
        </ChatPushProvider>
      </SessionProvider>
    </AppUpdates>
  );
}
