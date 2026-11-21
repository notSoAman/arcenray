/** Ignore skips until metadata is loaded; never send NaN to the native decoder. */
export function seekTarget(time: number, delta: number, duration: number) {
  if (!Number.isFinite(time)) return 0;
  const current = Math.max(0, time);
  if (!Number.isFinite(delta) || !Number.isFinite(duration) || duration <= 0)
    return current;
  return Math.min(Math.max(0, current + delta), duration);
}
