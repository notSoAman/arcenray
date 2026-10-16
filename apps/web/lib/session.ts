import "server-only";
import { createClient } from "./supabase/server";

/** True when `pnpm setup:web` (or an equivalent .env.local) supplied public config. */
export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export type ViewerProfile = {
  id: string;
  handle: string;
  full_name: string;
  bio: string;
  roles: string[];
  location_city: string | null;
  skills_gear: string[];
  profile_pic_key: string | null;
  onboarding_completed: boolean;
};

/**
 * Current signed-in user and their own profile row (RLS lets owners read their
 * pending profile). Pages still decide what to render; RLS stays the boundary.
 */
export async function getViewer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null, profileError: null };
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id,handle,full_name,bio,roles,location_city,skills_gear,profile_pic_key,onboarding_completed",
    )
    .eq("id", user.id)
    .maybeSingle();
  return {
    supabase,
    user,
    profile: (profile as ViewerProfile | null) ?? null,
    profileError: error,
  };
}
