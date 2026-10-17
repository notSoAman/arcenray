import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@repo/shared/database";
import { supabaseConfig } from "./config";

export async function createClient() {
  const { url, key } = supabaseConfig();
  const session =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY
      ? await auth()
      : null;
  return createSupabaseClient<Database>(url, key, {
    accessToken: async () => (session ? await session.getToken() : null),
  });
}
