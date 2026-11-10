import "react-native-url-polyfill/auto";
import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "../src/session";
import { LogoMark } from "../src/brand";
import { colors, fonts } from "../src/theme";
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
    <SessionProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.void },
          headerTintColor: colors.bone,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17 },
          contentStyle: { backgroundColor: colors.void },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="film/[id]" options={{ title: "Film" }} />
        <Stack.Screen name="u/[handle]" options={{ title: "Creative" }} />
        <Stack.Screen name="onboarding" options={{ title: "Your profile" }} />
        <Stack.Screen name="publish" options={{ title: "Publish" }} />
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
        <Stack.Screen name="chat/[id]" options={{ title: "Conversation" }} />
      </Stack>
    </SessionProvider>
  );
}
