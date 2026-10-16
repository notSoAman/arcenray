"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@repo/shared/database";
import { supabaseConfig } from "./config";
export function createClient() {
  const { url, key } = supabaseConfig();
  return createBrowserClient<Database>(url, key);
}
