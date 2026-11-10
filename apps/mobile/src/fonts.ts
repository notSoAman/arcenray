import { useFonts } from "expo-font";
import {
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
  InterTight_800ExtraBold,
} from "@expo-google-fonts/inter-tight";
import {
  CourierPrime_400Regular,
  CourierPrime_400Regular_Italic,
  CourierPrime_700Bold,
} from "@expo-google-fonts/courier-prime";

/**
 * Font family names, matching the accepted brand system (docs/design/README.md
 * and apps/web/app/globals.css): Inter Tight (grotesk) for headlines/body,
 * Courier Prime (tracked, uppercase) for kickers and labels only.
 */
export const fonts = {
  regular: "InterTight_400Regular",
  medium: "InterTight_500Medium",
  semibold: "InterTight_600SemiBold",
  bold: "InterTight_700Bold",
  extraBold: "InterTight_800ExtraBold",
  mono: "CourierPrime_400Regular",
  monoItalic: "CourierPrime_400Regular_Italic",
  monoBold: "CourierPrime_700Bold",
} as const;

/** Loads every brand face once. Gate the app on `loaded` so text never flashes system fonts. */
export function useAppFonts() {
  return useFonts({
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_600SemiBold,
    InterTight_700Bold,
    InterTight_800ExtraBold,
    CourierPrime_400Regular,
    CourierPrime_400Regular_Italic,
    CourierPrime_700Bold,
  });
}
