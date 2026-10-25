import { StyleSheet } from "react-native";

// Existing accepted web tokens, docs/design/README.md. No new brand system.
export const colors = {
  void: "#0E0F0E",
  graphite: "#1A1A1B",
  bone: "#F3EFE9",
  muted: "#A8A39C",
  ember: "#C2234B",
  pink: "#E8527A",
};

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.void },
  content: { padding: 24, gap: 20 },
  title: { color: colors.bone, fontSize: 32, fontWeight: "700" },
  body: { color: colors.bone, fontSize: 16, lineHeight: 24 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  button: {
    minHeight: 48,
    padding: 14,
    borderRadius: 24,
    backgroundColor: colors.bone,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonLabel: { color: colors.void, fontSize: 16, fontWeight: "600" },
  error: { color: colors.pink, fontSize: 16, lineHeight: 24 },
});
