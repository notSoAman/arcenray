/** NULL is the server's explicit unlimited account cap; malformed responses fail closed. */
export function canReserveStorage(storage: unknown, bytes: number): boolean {
  if (!storage || typeof storage !== "object" || Array.isArray(storage))
    throw new Error("Invalid storage response");
  const data = storage as Record<string, unknown>;
  const nonnegative = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  if (
    !nonnegative(bytes) ||
    !nonnegative(data.used_bytes) ||
    !nonnegative(data.reserved_bytes) ||
    !(data.quota_bytes === null || nonnegative(data.quota_bytes))
  )
    throw new Error("Invalid storage response");
  return (
    data.quota_bytes === null ||
    bytes <= data.quota_bytes - data.used_bytes - data.reserved_bytes
  );
}
