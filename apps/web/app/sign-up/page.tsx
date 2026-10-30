import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { Lockup, LogoTile } from "../../components/brand";
import { SetupNotice } from "../../components/setup-notice";
import styles from "../sign-in/sign-in.module.css";

export const metadata: Metadata = {
  title: "Sign up",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function SignUpPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  );
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
          <h1 className={styles.title}>Create your account</h1>
          {configured ? (
            <div className={styles.clerk}>
              <SignUp
                routing="hash"
                signInUrl="/sign-in"
                forceRedirectUrl="/onboarding"
              />
            </div>
          ) : (
            <SetupNotice />
          )}
          <Link href="/home" className="text-link">
            Browse films without an account
          </Link>
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
