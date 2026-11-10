import type { TextStyle } from "react-native";
import { fonts } from "./fonts";

/**
 * Arcenray brand tokens — mirrored from apps/web/app/globals.css
 * ("Brand system" artboard, v1.0). Change only with design-lead approval.
 * Neutrals do most of the work: ~45% Void, ~20% Bone.
 */
export const colors = {
  void: "#0E0F0E",
  graphite: "#1A1A1B",
  bone: "#F3EFE9",

  // Accents
  ember: "#C2234B", // primary accent, key CTAs
  pink: "#E8527A", // highlights, focus, accent words
  orange: "#FF8A2B", // badges, kickers
  lime: "#C6D79B", // success
  violet: "#7B4FA3",
  plum: "#3A1F33", // panels, empty states

  // Text on Void
  text: "#F3EFE9",
  textSoft: "#D9D3CA",
  muted: "#A8A39C",
  faint: "#8F8A83",

  // Hairlines
  line: "rgba(243, 239, 233, 0.1)",
  lineStrong: "rgba(243, 239, 233, 0.22)",

  // Film playback spectrum (btn-film-play gradient endpoints)
  filmPlayStart: "#713B9B",
  filmPlayMid: "#A52C68",
  filmPlayEnd: "#AD421E",
} as const;

export const radius = {
  pill: 999,
  card: 24,
  panel: 32,
  input: 16,
  poster: 18,
  chip: 22,
  tag: 14,
} as const;

export const typography: Record<
  "kicker" | "display" | "sectionTitle" | "body" | "bodySoft" | "muted",
  TextStyle
> = {
  /** Kicker / label — tracked uppercase Courier Prime. Labels and kickers only. */
  kicker: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 2.4, // ~0.22em at 11px
    textTransform: "uppercase",
  },
  /** Large page / film title (tuned per use via fontSize). */
  display: {
    fontFamily: fonts.extraBold,
    letterSpacing: -1.2, // -0.035em at 34px
    lineHeight: 1,
  },
  sectionTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 26,
    letterSpacing: -0.52, // -0.02em at 26px
    lineHeight: 30,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  bodySoft: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 23,
  },
  muted: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
  },
};

export { fonts };
