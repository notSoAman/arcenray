/** Onboarding selection limits, shared with the mobile flow. */
export const MIN_ROLES = 1;
export const VIBE_MAX = 3;

/**
 * Vibe picks are a three-card selection. Once three are chosen, further
 * picks stay locked until a card is deselected, matching the mobile flow.
 */
export function nextVibeSelection(
  current: readonly string[],
  id: string,
): string[] {
  if (current.includes(id)) {
    return current.filter((choice) => choice !== id);
  }
  if (current.length < VIBE_MAX) {
    return [...current, id];
  }
  return [...current];
}

/** Instruction line above the vibe grid: requirement, live count, locked hint. */
export function vibeInstruction(count: number, total: number): string {
  const chosen = count > 0 ? ` ${count} of ${VIBE_MAX} chosen.` : "";
  const locked =
    count >= VIBE_MAX ? " Deselect a card to change your choices." : "";
  return `Choose exactly ${VIBE_MAX} of ${total} interests.${chosen}${locked}`;
}

/** Live handle feedback; null means the value is valid or not yet entered. */
export function handleIssue(value: string): string | null {
  if (value === "") return null;
  return /^[a-z0-9_]{3,32}$/.test(value)
    ? null
    : "Use 3–32 lowercase letters, numbers or underscores.";
}

/** Status line under the skills input, counting toward the limit. */
export function skillsHint(count: number, max: number): string {
  if (count === 0) return "Press Enter or comma to add each one.";
  if (count >= max) {
    return `${count} of ${max} added. Remove one to add another.`;
  }
  return `${count} of ${max} added. Press Enter or comma to add each one.`;
}
