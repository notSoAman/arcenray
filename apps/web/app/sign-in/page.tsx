import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lockup, LogoTile } from "../../components/brand";
import { SetupNotice } from "../../components/setup-notice";
import { getViewer, isSupabaseConfigured } from "../../lib/session";
import { SignInForm } from "./sign-in-form";
import styles from "./sign-in.module.css";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const linkErrors = {
  expired:
    "That sign-in link has expired. Links work once and only for a short time — request a new one below.",
  link: "That sign-in link didn't work. It may have expired or already been used. Request a new one below.",
} as const;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; new?: string }>;
}) {
  const configured = isSupabaseConfigured();
  if (configured) {
    const { user } = await getViewer();
    if (user) redirect("/");
  }
  const params = await searchParams;
  const linkError =
    params.error === "expired" || params.error === "link"
      ? linkErrors[params.error]
      : null;
  const isNew = params.new === "1";

  return (
    <div className={styles.page}>
      <aside className={`${styles.art} spectrum-hero`} aria-hidden="true">
        <span className={styles.artShade} />
        <div className={styles.artInner}>
          <LogoTile className={styles.artTile} />
          <p className={styles.artLine}>
            Find your people.
            <br />
            <span>Make your art.</span>
          </p>
        </div>
      </aside>

      <main className={styles.panel}>
        <div className={styles.panelTop}>
          <Lockup />
        </div>
        <div className={styles.formWrap}>
          <span className={`kicker ${styles.kicker}`}>
            {isNew ? "Join arcenray." : "Welcome back"}
          </span>
          <h1 className={styles.title}>
            {isNew ? "Create your account" : "Sign in"}
          </h1>
          <p className={styles.lede}>
            We&apos;ll email you a one-time link — no password needed. New here?
            The same link creates your account.
          </p>
          {configured ? <SignInForm linkError={linkError} /> : <SetupNotice />}
        </div>
      </main>
    </div>
  );
}
