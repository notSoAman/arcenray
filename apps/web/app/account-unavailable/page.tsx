import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "../../components/sign-out-button";
import styles from "../settings/settings.module.css";
export const metadata: Metadata = { title: "Account unavailable" };
export default function AccountUnavailablePage() {
  return (
    <main className={styles.page}>
      <p className="kicker">Account access</p>
      <h1>Your account is unavailable.</h1>
      <p>
        This account may be disabled or awaiting deletion. Signing in again does
        not create a replacement profile or restore deleted content.
      </p>
      <div className={styles.actions}>
        <Link href="/settings/support" className="btn btn-primary">
          Support options
        </Link>
        <Link href="/home" className="btn btn-ghost">
          Browse public films
        </Link>
        {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
          process.env.CLERK_SECRET_KEY && (
            <SignOutButton className="btn btn-ghost" />
          )}
      </div>
    </main>
  );
}
