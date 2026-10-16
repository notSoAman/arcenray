import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer, isSupabaseConfigured } from "../../lib/session";
import { isCreativeRole } from "../../lib/roles";
import { OnboardingFlow } from "./onboarding-flow";
import styles from "./onboarding.module.css";

export const metadata: Metadata = { title: "Set up your profile" };
export const dynamic = "force-dynamic";

/** Pending profiles get a UUID-derived placeholder handle; don't suggest it back. */
const placeholderHandle = /^[0-9a-f]{32}$/;

export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) redirect("/");
  const { user, profile, profileError } = await getViewer();
  if (!user) redirect("/sign-in");
  if (profile?.onboarding_completed) redirect("/home");

  if (profileError || !profile) {
    return (
      <main className={styles.fallback}>
        <div className="notice notice-error" role="alert">
          <div>
            <strong>We couldn&apos;t load your profile.</strong> Your account is
            fine — this is usually a brief connection problem.
          </div>
        </div>
        <Link href="/onboarding" className="btn btn-primary">
          Try again
        </Link>
      </main>
    );
  }

  return (
    <OnboardingFlow
      userId={user.id}
      email={user.email ?? null}
      initial={{
        roles: profile.roles.filter(isCreativeRole),
        full_name: profile.full_name,
        handle: placeholderHandle.test(profile.handle) ? "" : profile.handle,
        location_city: profile.location_city ?? "",
        bio: profile.bio,
        skills_gear: profile.skills_gear,
      }}
    />
  );
}
