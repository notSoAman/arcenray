import { View, Text } from "react-native";
import { router } from "expo-router";
import { Spectrum } from "../src/visuals";
import { Lockup } from "../src/brand";
import { Button, Kicker, Muted, Screen } from "../src/ui";
import { colors, displayTitle } from "../src/theme";

export default function NotFound() {
  return (
    <Screen topInset>
      <View style={{ paddingTop: 8 }}>
        <Lockup size={26} />
      </View>
      <View style={{ borderRadius: 28, overflow: "hidden", height: 180 }}>
        <Spectrum kind="hero" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: "rgba(14,15,14,0.5)",
          }}
        />
        <View style={{ flex: 1, padding: 22, justifyContent: "flex-end" }}>
          <Kicker color={colors.orange} style={{ fontStyle: "italic" }}>
            404
          </Kicker>
        </View>
      </View>
      <View style={{ gap: 10 }}>
        <Text accessibilityRole="header" style={displayTitle(38)}>
          Page unavailable
        </Text>
        <Muted>
          This link may be broken, or the film or profile was removed. Everything
          else is still waiting for you.
        </Muted>
      </View>
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        <Button title="Return to films" onPress={() => router.replace("/home")} />
        <Button title="Search" variant="ghost" onPress={() => router.replace("/search")} />
      </View>
    </Screen>
  );
}
