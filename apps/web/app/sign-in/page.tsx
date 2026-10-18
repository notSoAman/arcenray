import type { Metadata } from "next";
import Link from "next/link";
import { safeNextPath } from "@repo/shared";
import { redirect } from "next/navigation";
import { Lockup, LogoTile } from "../../components/brand";
import { SetupNotice } from "../../components/setup-notice";
import { getViewer, isSupabaseConfigured } from "../../lib/session";
import { SignInForm } from "./sign-in-form";
import styles from "./sign-in.module.css";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; new?: string; next?: string }>;
}) {
  const configured =
    isSupabaseConfigured() &&
    Boolean(
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.CLERK_SECRET_KEY,
    );
  if (configured) {
    const { user } = await getViewer();
    if (user)
      redirect(
        safeNextPath((await searchParams).next) === "/"
          ? "/home"
          : safeNextPath((await searchParams).next),
      );
  }
  const params = await searchParams;
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
            Sign in with Google, your email address or account username.
          </p>
          {configured ? (
            <SignInForm
              next={
                safeNextPath(params.next) === "/"
                  ? "/home"
                  : safeNextPath(params.next)
              }
            />
          ) : (
            <SetupNotice />
          )}
          <p className={styles.legal}>
            <Link href="/privacy">Privacy Policy</Link>
            {" · "}
            <Link href="/terms">Terms of Service</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
