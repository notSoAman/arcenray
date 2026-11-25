import { validOnboardingChoices } from "@repo/shared";

export type OnboardingStepValues = {
  name: string;
  handle: string;
  roles: readonly string[];
  choices: readonly string[];
  skills: readonly string[];
};

export function validateOnboardingStep(
  step: number,
  values: OnboardingStepValues,
): string | null {
  if (step === 0) {
    if (!values.name.trim()) return "Add your name to continue.";
    if (!/^[a-z0-9_]{3,32}$/i.test(values.handle.trim()))
      return "Choose a handle with 3–32 letters, numbers or underscores.";
    return null;
  }

  if (step === 1) {
    if (values.roles.length === 0) return "Choose at least one creative role.";
    if (values.skills.length > 30)
      return "Choose up to 30 skills or interests.";
    if (values.skills.some((skill) => skill.length > 80))
      return "Keep each skill or interest under 80 characters.";
    return null;
  }

  return validOnboardingChoices(values.choices)
    ? null
    : "Choose three references to shape your first feed.";
}
