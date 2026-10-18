/** Canonical values match the reviewed SQL allowlist; no fabricated embedding vectors. */
export const onboardingChoices = [
  {
    id: "atmospheric",
    label: "Atmospheric",
    detail: "Quiet worlds, lingering frames",
    color: "mist",
  },
  {
    id: "intimate",
    label: "Intimate",
    detail: "Small moments, human stories",
    color: "ember",
  },
  {
    id: "kinetic",
    label: "Kinetic",
    detail: "Movement, momentum, energy",
    color: "lime",
  },
  {
    id: "dreamlike",
    label: "Dreamlike",
    detail: "Surreal worlds, blurred realities",
    color: "violet",
  },
  {
    id: "tense",
    label: "Tense",
    detail: "Suspense, mystery, unease",
    color: "shadow",
  },
  {
    id: "hopeful",
    label: "Hopeful",
    detail: "Connection, resilience, light",
    color: "lime",
  },
  {
    id: "melancholic",
    label: "Melancholic",
    detail: "Memory, longing, reflection",
    color: "mist",
  },
  {
    id: "playful",
    label: "Playful",
    detail: "Humour, surprise, delight",
    color: "pink",
  },
  {
    id: "gritty",
    label: "Gritty",
    detail: "Raw textures, grounded lives",
    color: "ember",
  },
  {
    id: "experimental",
    label: "Experimental",
    detail: "Unusual forms, fresh perspectives",
    color: "violet",
  },
  {
    id: "documentary",
    label: "Documentary",
    detail: "Real people, real observations",
    color: "shadow",
  },
  {
    id: "musical",
    label: "Musical",
    detail: "Rhythm, sound, performance",
    color: "pink",
  },
] as const;

export function validOnboardingChoices(choices: readonly string[]) {
  return (
    choices.length === 3 &&
    new Set(choices).size === 3 &&
    choices.every((choice) => onboardingChoices.some(({ id }) => id === choice))
  );
}
