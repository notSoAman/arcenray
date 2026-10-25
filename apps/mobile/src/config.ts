type PublicEnvironment = {
  supabaseUrl?: string;
  supabaseKey?: string;
  clerkKey?: string;
  mediaUrl?: string;
};

function httpsOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/** Clerk publishable keys are intended for clients; secret keys are never accepted. */
export function readConfig(env: PublicEnvironment) {
  const url = httpsOrigin(env.supabaseUrl);
  const key = env.supabaseKey?.startsWith("sb_publishable_")
    ? env.supabaseKey
    : null;
  return {
    backend: url && key ? { url, key } : null,
    clerkKey: /^(pk_test_|pk_live_)/.test(env.clerkKey ?? "")
      ? env.clerkKey!
      : null,
    mediaOrigin: httpsOrigin(env.mediaUrl),
  };
}

export const config = readConfig({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  clerkKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
  mediaUrl: process.env.EXPO_PUBLIC_MEDIA_URL,
});

/** Only durable object keys from public rows, under the configured media origin. */
export function publicMediaUrl(origin: string | null, key: string | null) {
  if (
    !origin ||
    !key ||
    !/^[a-zA-Z0-9_./-]+$/.test(key) ||
    key.startsWith("/") ||
    key.split("/").some((part) => !part || part === "." || part === "..")
  )
    return null;
  return `${origin}/${key}`;
}
