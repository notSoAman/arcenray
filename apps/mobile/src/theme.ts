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
  graphiteRaised: "#202021",
  ink: "#141415",
  bone: "#F3EFE9",
  white: "#FFFFFF",

  // Accents
  ember: "#C2234B", // primary accent, key CTAs
  emberHover: "#D12A55",
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
  chead: "#CFC9C0",

  // Hairlines
  line: "rgba(243, 239, 233, 0.1)",
  lineStrong: "rgba(243, 239, 233, 0.22)",
  lineFaint: "rgba(243, 239, 233, 0.06)",

  // Film playback spectrum (btn-film-play gradient endpoints)
  filmPlayStart: "#713B9B",
  filmPlayMid: "#A52C68",
  filmPlayEnd: "#AD421E",
} as const;

export const radius = {
  pill: 999,
  card: 24,
  cardSm: 20,
  panel: 32,
  input: 16,
  poster: 18,
  chip: 22,
  tag: 14,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  section: 36,
} as const;

export const shadow = {
  poster: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.45,
    shadowRadius: 30,
    elevation: 16,
  },
  floating: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 12,
  },
} as const;

export const gradients = {
  filmPlay: [colors.filmPlayStart, colors.filmPlayMid, colors.filmPlayEnd] as const,
  filmPlayLocations: [0, 0.48, 1] as const,
  scrimStrong: ["rgba(14,15,14,0)", "rgba(14,15,14,0.55)", "rgba(14,15,14,0.95)"] as const,
  scrimTop: ["rgba(14,15,14,0.72)", "rgba(14,15,14,0)"] as const,
} as const;

/**
 * Shared type styles. Never set a pixel lineHeight below the font size on
 * display text — React Native clips the glyphs (the "dashes" bug).
 */
export const typography: Record<
  "kicker" | "display" | "sectionTitle" | "body" | "bodySoft" | "muted" | "small",
  TextStyle
> = {
  /** Kicker / label — tracked uppercase Courier Prime. Labels and kickers only. */
  kicker: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 2.4, // ~0.22em at 11px
    lineHeight: 16,
    textTransform: "uppercase",
  },
  /** Large page / film title (tuned per use via fontSize + lineHeight). */
  display: {
    fontFamily: fonts.extraBold,
    letterSpacing: -1.2, // -0.035em at 34px
  },
  sectionTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 26,
    letterSpacing: -0.52, // -0.02em at 26px
    lineHeight: 31,
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
  small: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
};

/** Web `.page-title` on a phone: clamp(36px, 5vw, 64px). */
export function displayTitle(size = 38): TextStyle {
  return {
    color: colors.text,
    fontFamily: fonts.extraBold,
    fontSize: size,
    lineHeight: Math.round(size * 1.02),
    letterSpacing: -size * 0.04,
  };
}

/** Web `.section-title`. */
export function sectionTitleStyle(size = 26): TextStyle {
  return {
    color: colors.text,
    fontFamily: fonts.extraBold,
    fontSize: size,
    lineHeight: Math.round(size * 1.18),
    letterSpacing: -size * 0.02,
  };
}

export { fonts };
