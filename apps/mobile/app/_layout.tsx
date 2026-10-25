import "react-native-url-polyfill/auto";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "../src/session";
import { colors } from "../src/theme";
export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.void },
          headerTintColor: colors.bone,
          contentStyle: { backgroundColor: colors.void },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: "Your account" }} />
        <Stack.Screen name="film/[id]" options={{ title: "Film" }} />
        <Stack.Screen name="u/[handle]" options={{ title: "Creative" }} />
        <Stack.Screen name="onboarding" options={{ title: "Your profile" }} />
        <Stack.Screen name="publish" options={{ title: "Publish" }} />
        <Stack.Screen name="invitations" options={{ title: "Credits" }} />
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
        <Stack.Screen name="chat/[id]" options={{ title: "Conversation" }} />
      </Stack>
    </SessionProvider>
  );
}
