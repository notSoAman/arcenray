/** App-specific additions; Clerk merges these with its nonce/abuse-protection defaults. */
export function appCspDirectives(
  config: { supabaseUrl?: string; mediaUrl?: string },
  production: boolean,
) {
  function origin(value: string | undefined) {
    if (!value) return null;
    if (/[;\s]/.test(value)) throw new Error("Invalid service origin");
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && local && !production)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error(
        "Security policy requires a clean HTTPS service origin (local HTTP is development-only)",
      );
    return url.origin;
  }
  const supabase = origin(config.supabaseUrl);
  const media = origin(config.mediaUrl);
  const realtime = supabase ? supabase.replace(/^http/, "ws") : null;
  return {
    "connect-src": [
      "'self'",
      ...[supabase, realtime, media].filter(
        (value): value is string => !!value,
      ),
      "https://*.r2.cloudflarestorage.com",
    ],
    "img-src": ["'self'", "data:", "blob:", ...(media ? [media] : [])],
    "media-src": ["'self'", "blob:", ...(media ? [media] : [])],
    "font-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "frame-ancestors": ["'none'"],
    "frame-src": [
      "https://www.youtube-nocookie.com",
      "https://player.vimeo.com",
    ],
    // Clerk and our UI use runtime inline style attributes/CSS-in-JS.
    "style-src": ["'self'", "'unsafe-inline'"],
  };
}

/** Setup without Clerk keys must stay browsable; do not block Next's bootstrap scripts. */
export const setupCsp =
  "object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
