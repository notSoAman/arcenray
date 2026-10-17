import "server-only";
import { auth } from "@clerk/nextjs/server";
import { cache } from "react";
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
export const getViewer = cache(async function getViewer() {
  const supabase = await createClient();
  const session =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY
      ? await auth()
      : null;
  if (!session?.userId)
    return { supabase, user: null, profile: null, profileError: null };
  const { data: id, error: identityError } = await supabase.rpc(
    "ensure_current_profile",
  );
  // A Clerk user with a provisioning error must not be treated as an anonymous viewer.
  if (identityError || !id)
    throw new Error("Could not initialize your account. Please retry shortly.");
  const user = { id, email: null as string | null, clerkId: session.userId };
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
});
