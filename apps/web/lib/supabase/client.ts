"use client";
import { getToken } from "@clerk/nextjs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@repo/shared/database";
import { supabaseConfig } from "./config";

export function createClient() {
  const { url, key } = supabaseConfig();
  return createSupabaseClient<Database>(url, key, {
    accessToken: async () =>
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? await getToken() : null,
  });
}
