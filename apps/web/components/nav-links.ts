export type NavViewer = {
  name: string;
  handle: string;
  picKey: string | null;
  /** Onboarding not finished; the row still carries its pending UUID handle. */
  pending: boolean;
};

/** The "You" entry routes pending profiles to onboarding, guests to sign-in. */
export function profileLinkTarget(
  viewer: NavViewer | null,
  pathname: string,
): string {
  if (!viewer) {
    return `/sign-in?next=${encodeURIComponent(pathname)}`;
  }
  return viewer.pending ? "/onboarding" : `/u/${viewer.handle}`;
}

/** Pending profiles must not show an initial derived from their UUID handle. */
export function avatarLabel(viewer: NavViewer): string {
  return viewer.name || (viewer.pending ? "You" : viewer.handle);
}
