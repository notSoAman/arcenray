import type { Metadata } from "next";
import Link from "next/link";
import styles from "../settings/settings.module.css";
export const metadata: Metadata = { title: "Deletion requested" };
export default function AccountDeletedPage() {
  return (
    <main className={styles.page}>
      <p className="kicker">Account deletion</p>
      <h1>Deletion requested.</h1>
      <p>
        After an accepted deletion request, your account is unavailable while
        background cleanup removes its remaining data and stored media. This
        page does not confirm that every background task has finished.
      </p>
      <p>
        If your request returned an error, contact support before assuming your
        account was deleted.
      </p>
      <div className={styles.actions}>
        <Link href="/home" className="btn btn-primary">
          Browse public films
        </Link>
        <Link href="/settings/support" className="btn btn-ghost">
          Support options
        </Link>
      </div>
    </main>
  );
}
