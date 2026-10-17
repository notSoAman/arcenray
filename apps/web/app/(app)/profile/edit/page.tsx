import type { Metadata } from "next";
import { isCreativeRole } from "../../../../lib/roles";
import { getViewer } from "../../../../lib/session";
import { OnboardingFlow } from "../../../onboarding/onboarding-flow";
import styles from "./edit.module.css";

export const metadata: Metadata = { title: "Edit profile" };
export const dynamic = "force-dynamic";

/** Same two steps as onboarding, pre-filled, returning to the profile on save. */
export default async function EditProfilePage() {
  const { user, profile } = await getViewer();
  if (!user || !profile) return null; // layout redirects

  return (
    <div className={styles.wrap}>
      <OnboardingFlow
        mode="edit"
        userId={user.id}
        email={user.email ?? null}
        initial={{
          roles: profile.roles.filter(isCreativeRole),
          full_name: profile.full_name,
          handle: profile.handle,
          location_city: profile.location_city ?? "",
          bio: profile.bio,
          skills_gear: profile.skills_gear,
        }}
      />
    </div>
  );
}
