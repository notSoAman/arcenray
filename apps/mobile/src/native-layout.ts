/** The tab bar floats above system gestures; its internal controls keep their full height. */
export function floatingTabBarLayout(bottomInset: number) {
  return { height: 66, marginBottom: Math.max(0, bottomInset) + 12 };
}
