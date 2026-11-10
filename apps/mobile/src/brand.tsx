import { Image, View, Text } from "react-native";
import { colors, fonts } from "./theme";

const MARK_RATIO = 185 / 160; // arcenray-mark.webp is 160×185.

/** The accepted lowercase "a" mark (exported from the design canvas). */
export function LogoMark({
  size = 28,
  decorative = true,
}: {
  size?: number;
  decorative?: boolean;
}) {
  return (
    <Image
      source={require("../assets/arcenray-mark.webp")}
      accessibilityIgnoresInvertColors
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : "arcenray"}
      style={{ width: size, height: Math.round(size * MARK_RATIO) }}
      resizeMode="contain"
    />
  );
}

/** Mark + wordmark lockup, matching the web header. */
export function Lockup({ size = 28 }: { size?: number }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        minHeight: 44,
      }}
      accessible
      accessibilityLabel="arcenray. home"
    >
      <LogoMark size={size} />
      <Text
        style={{
          color: colors.bone,
          fontFamily: fonts.extraBold,
          fontSize: 22,
          letterSpacing: -0.04 * 22,
          lineHeight: 22,
        }}
        allowFontScaling={false}
      >
        arcenray.
      </Text>
    </View>
  );
}

/** Large logo on a calm Void tile — never over busy artwork. */
export function LogoTile({ size = 180 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.18, // ~30px at 180, matching sign-in artTile
        backgroundColor: colors.void,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image
        source={require("../assets/arcenray-a.webp")}
        accessibilityLabel="arcenray logo"
        accessibilityIgnoresInvertColors
        style={{ width: size * 0.62, height: size * 0.62 * (697 / 600) }}
        resizeMode="contain"
      />
    </View>
  );
}
