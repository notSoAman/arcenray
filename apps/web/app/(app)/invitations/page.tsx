import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreditInvitations } from "../../../components/credit-invitations";
import { getViewer } from "../../../lib/session";
import styles from "./invitations.module.css";

export const metadata: Metadata = { title: "Credit invitations" };

export default async function InvitationsPage() {
  const { user, profile, profileError } = await getViewer();
  if (!user) redirect("/sign-in?next=%2Finvitations");
  if (profileError)
    throw new Error("Could not load your profile. Please retry.");
  if (!profile?.onboarding_completed) redirect("/onboarding");
  return (
    <main className={styles.page}>
      <p className="kicker">Your collaborations</p>
      <h1>Credit invitations</h1>
      <p className={styles.intro}>
        Connect your work to the films you helped make. Accept an invitation to
        confirm your contribution.
      </p>
      <CreditInvitations key={profile.id} viewerId={profile.id} />
    </main>
  );
}
