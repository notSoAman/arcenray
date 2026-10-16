import { creativeRoles } from "@repo/shared/contracts";

export type CreativeRole = (typeof creativeRoles)[number];

/** Display labels for the canonical role taxonomy in packages/shared. */
export const roleLabels: Record<CreativeRole, string> = {
  director: "Directing",
  actor: "Acting",
  cinematographer: "Cinematography",
  editor: "Editing",
  writer: "Screenwriting",
  producer: "Producing",
  sound_designer: "Sound design",
  colorist: "Colour grading",
  composer: "Composing",
  musician: "Music",
  other: "Something else",
};

/** Ordered as in the onboarding design; canonical values are what get stored. */
export const roleOptions: CreativeRole[] = [
  "director",
  "actor",
  "cinematographer",
  "editor",
  "writer",
  "producer",
  "sound_designer",
  "colorist",
  "composer",
  "musician",
  "other",
];

/** Short person-facing role names, e.g. on creator lines and profile chips. */
export const rolePersonLabels: Record<CreativeRole, string> = {
  director: "Director",
  actor: "Actor",
  cinematographer: "Cinematographer",
  editor: "Editor",
  writer: "Writer",
  producer: "Producer",
  sound_designer: "Sound designer",
  colorist: "Colourist",
  composer: "Composer",
  musician: "Musician",
  other: "Creative",
};

export function personRole(role: string | undefined) {
  if (!role) return null;
  return (rolePersonLabels as Record<string, string>)[role] ?? role;
}

export function isCreativeRole(value: string): value is CreativeRole {
  return (creativeRoles as readonly string[]).includes(value);
}
