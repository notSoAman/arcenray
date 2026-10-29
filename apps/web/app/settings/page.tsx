import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { accountConfig } from "../../lib/account/server";
import { DeleteAccount } from "./delete-account";
import { SignOutButton } from "../../components/sign-out-button";
import styles from "./settings.module.css";
import { getViewer } from "../../lib/session";
import { ProfileSettings } from "./profile-settings";
export const metadata: Metadata = { title: "Account settings" };
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  if (
    !process.env.CLERK_SECRET_KEY ||
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    !(await auth()).userId
  )
    redirect("/sign-in?next=%2Fsettings");
  const state = await (await createClient()).rpc("get_account_status");
  if (state.error)
    throw new Error("Could not verify account status. Please retry.");
  if (
    state.data &&
    typeof state.data === "object" &&
    !Array.isArray(state.data) &&
    ["suspended", "deleting", "deleted"].includes(String(state.data.status))
  )
    redirect("/account-unavailable");
  const moderator = await (await createClient()).rpc("is_moderator");
  if (moderator.error) throw new Error("Could not verify account permissions.");
  const { profile, profileError } = await getViewer();
  if (profileError || !profile)
    throw new Error("Could not load your profile. Please retry.");
  return (
    <main className={styles.page}>
      <p className="kicker">Your account</p>
      <h1>Account settings</h1>
      <p>Manage your Arcenray profile and account.</p>
      <ProfileSettings initial={profile} />
      <div className={styles.actions}>
        <SignOutButton className="btn btn-ghost" />
        <Link className="btn btn-ghost" href="/home">
          Back to films
        </Link>
      </div>
      {moderator.data ? (
        <section className={styles.panel}>
          <h2>Founder moderation</h2>
          <p>
            Transfer moderator responsibility before deleting this founder
            account.
          </p>
          <Link href="/admin/reports" className="btn btn-primary">
            Review reports
          </Link>
        </section>
      ) : (
        <details className={styles.danger}>
          <summary>Account deletion</summary>
          <DeleteAccount configured={accountConfig() !== null} />
        </details>
      )}
      <nav className={styles.links} aria-label="Help and policies">
        <Link href="/settings/support">Support & reporting</Link>
      </nav>
    </main>
  );
}
