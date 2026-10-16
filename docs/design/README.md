# Arcenray design reference

Source supplied by the founder: [Claude artifact](https://claude.ai/artifact/5wapxcaa1Em9CVdM23kAW6)
(design canvas "Arcenray", pages: Mobile MVP, Website MVP, Brand, Later).
Handoff recorded 2026-10-17; this date is not an artifact version or visual approval.
Design owner: collaborator using Claude Code. Technical owner: founder using Codex.

## Imported into the web app (2026-10-17, canvas version `1792179649-c01a`)

Read directly from the canvas by the design lead's Claude Code session:

- **Logo exports** (canvas assets, unmodified) in `apps/web/public/brand/`:
  `arcenray-a.webp` (600×697, full mark), `arcenray-mark.webp` (160×185, small mark),
  `spectrum-hero.webp` and `spectrum-strip.webp` (signature spectrum artwork).
- **Tokens** from the "Brand system" artboard (v1.0, October 2026), defined in
  `apps/web/app/globals.css`: Void `#0E0F0E`, Graphite `#1A1A1B`, Bone `#F3EFE9`,
  Ember Crimson `#C2234B`, Signal Pink `#E8527A`, Solar Orange `#FF8A2B`,
  Lime Mist `#C6D79B`, Orchid Violet `#7B4FA3`, Deep Plum `#3A1F33`.
- **Type**: grotesk (Helvetica Neue → Inter Tight) for headlines/body; Courier Prime,
  tracked and uppercase, for kickers and labels only.
- **Rules**: calls to action are Bone or Ember Crimson only; orange marks badges,
  lime marks success; the logo sits on a Void panel, never over busy artwork.

Screens implemented from the canvas: welcome (W1 hero + 01 splash), multi-role
onboarding (01), home feed (W1). Discover, search, film page, player, profile and
chats artboards are not implemented yet.

Use the reference for the cinematic filmmaking/collaboration UI, with the exclusions
in AGENTS.md: no stories, generic social-post clone or unapproved hiring marketplace.
Detailed appearance and screen states belong to the accepted design, not a new system
invented by a backend agent.
