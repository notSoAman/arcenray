/** Validate compatibility; never rewrite the generated runtime to force delivery. */
export function assertOtaRuntime(actual: unknown, installed: string) {
  if (typeof actual !== 'string' || !actual) throw new Error('Missing generated Android fingerprint.');
  if (actual !== installed) throw new Error('Native runtime changed. Publish a new Play build and verify it before updating the OTA target.');
}

export function parseGeneratedFingerprint(text: string) {
  const jsonStart = text.lastIndexOf('\n{');
  return JSON.parse(jsonStart >= 0 ? text.slice(jsonStart + 1) : text);
}
