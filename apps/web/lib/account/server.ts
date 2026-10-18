import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@repo/shared/database";

/** Fixed, operator-selected issuer. Never accept issuer, email or profile from the browser/webhook payload. */
export function accountConfig() {
  const issuer = process.env.CLERK_ISSUER;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!issuer || !url || !key || !process.env.CLERK_SECRET_KEY) return null;
  try {
    const parsed = new URL(issuer);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/" ||
      issuer !== parsed.origin
    )
      return null;
    return { issuer, url, key };
  } catch {
    return null;
  }
}
export function accountService(
  config: NonNullable<ReturnType<typeof accountConfig>>,
) {
  return createClient<Database>(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export function accountReply(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
