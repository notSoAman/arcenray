import {
  Image,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type ImageStyle,
} from "react-native";
import { config, publicMediaUrl } from "./config";
import { colors, fonts } from "./theme";

const spectrumStrip = require("../assets/spectrum-strip.webp");
const spectrumHero = require("../assets/spectrum-hero.webp");

/**
 * Film poster or the signature spectrum artwork. Mirrors
 * apps/web/components/media.tsx.
 */
export function Poster({
  posterKey,
  title,
  aspect = 2 / 3,
  style,
  rounded = false,
}: {
  posterKey: string | null | undefined;
  title: string;
  aspect?: number;
  style?: StyleProp<ViewStyle>;
  rounded?: boolean;
}) {
  const src = publicMediaUrl(config.mediaOrigin, posterKey ?? null);
  return (
    <View
      style={[
        {
          aspectRatio: aspect,
          overflow: "hidden",
          backgroundColor: colors.graphite,
          borderRadius: rounded ? 18 : 0,
        },
        style,
      ]}
    >
      {src ? (
        <Image
          source={{ uri: src }}
          accessibilityLabel={`${title} poster`}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <Spectrum />
      )}
    </View>
  );
}

/** Spectrum banner artwork (featured film, profile hero, sign-in art). */
export function Spectrum({
  kind = "hero",
  style,
}: {
  kind?: "hero" | "strip";
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={kind === "hero" ? spectrumHero : spectrumStrip}
      accessible={false}
      accessibilityIgnoresInvertColors
      resizeMode="cover"
      style={[{ width: "100%", height: "100%" }, style]}
    />
  );
}

/** Round profile picture; falls back to the initial over the spectrum. */
export function Avatar({
  picKey,
  name,
  size = 48,
  style,
}: {
  picKey: string | null | undefined;
  name: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const src = publicMediaUrl(config.mediaOrigin, picKey ?? null);
  const initial = name.trim().charAt(0).toUpperCase() || "a";
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
          backgroundColor: colors.graphite,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {src ? (
        <Image
          source={{ uri: src }}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <>
          <Image
            source={spectrumHero}
            accessibilityIgnoresInvertColors
            resizeMode="cover"
            style={{ position: "absolute", width: "100%", height: "100%" }}
          />
          <Text
            style={{
              color: colors.bone,
              fontFamily: fonts.bold,
              fontSize: Math.round(size * 0.4),
            }}
          >
            {initial}
          </Text>
        </>
      )}
    </View>
  );
}
