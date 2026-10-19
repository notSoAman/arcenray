/** Clerk usernames seed a public handle once; subsequent profile edits are retained. */
export function signupHandle(
  username: string | null | undefined,
): string | null {
  const value = username?.trim().toLowerCase().replace(/[.-]/g, "_");
  return value && /^[a-z0-9_]{3,32}$/.test(value) ? value : null;
}
export function initialProfileHandle(
  profile: { id: string; handle: string },
  username?: string | null,
) {
  return profile.handle === profile.id.replaceAll("-", "")
    ? (signupHandle(username) ?? "")
    : profile.handle;
}
