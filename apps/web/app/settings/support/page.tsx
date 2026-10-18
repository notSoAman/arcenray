import type { Metadata } from "next";
import Link from "next/link";
import styles from "../settings.module.css";
export const metadata: Metadata = { title: "Support and reporting" };
export default function SupportPage() {
  const configured = process.env.SUPPORT_EMAIL;
  const email =
    configured &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(configured) &&
    !/[\r\n?&#]/.test(configured)
      ? configured
      : null;
  return (
    <main className={styles.page}>
      <p className="kicker">Arcenray support</p>
      <h1>Help, safety & your work.</h1>
      <section className={styles.panel}>
        <h2>Report content</h2>
        <p>
          Signed-in users can report a film from its watch page or report a
          profile. Include enough context for review. Reports are private; a
          report does not automatically establish wrongdoing or remove content.
        </p>
        <h2>Copyright, privacy or account requests</h2>
        {email ? (
          <p>
            Contact <a href={`mailto:${email}`}>{email}</a>. Include the
            relevant Arcenray film/profile URL and a description of the issue.
            Never send passwords, sign-in codes or private access keys.
          </p>
        ) : (
          <p role="status">
            A public support contact has not been configured for this
            development environment. Ask the founder through the project channel
            you already use. Public launch is blocked until a monitored support
            contact is published.
          </p>
        )}
        <p>
          For account deletion, use the confirmed deletion flow in account
          settings when it is enabled.
        </p>
        <div className={styles.actions}>
          <Link href="/settings" className="btn btn-ghost">
            Account settings
          </Link>
          <Link href="/home" className="btn btn-primary">
            Browse films
          </Link>
        </div>
      </section>
    </main>
  );
}
