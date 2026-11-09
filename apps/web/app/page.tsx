import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { LogoTile } from "../components/brand";
import { SetupNotice } from "../components/setup-notice";
import { SiteHeader } from "../components/site-header";
import { getViewer, isSupabaseConfigured } from "../lib/session";
import styles from "./welcome.module.css";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Arcenray",
    locale: "en_IN",
    title: "Arcenray — discover independent short films & filmmakers",
    description:
      "Discover independent short films, meet the filmmakers and creative crew behind them, and find collaborators for your next project.",
    url: "/",
    images: [
      {
        url: "/brand/spectrum-hero.webp",
        width: 1846,
        height: 576,
        alt: "Arcenray — find your people, make your art",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Arcenray — discover independent short films & filmmakers",
    description:
      "Discover independent short films, meet the filmmakers and creative crew behind them, and find collaborators for your next project.",
    images: ["/brand/spectrum-hero.webp"],
  },
};

export const dynamic = "force-dynamic";

const siteIdentity = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Arcenray",
  url: "https://arcenray.com/",
};

export default async function WelcomePage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const configured = isSupabaseConfigured();
  if (configured) {
    const { user, profile } = await getViewer();
    if (user) redirect(profile?.onboarding_completed ? "/home" : "/onboarding");
  }

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteIdentity) }}
      />
      <SiteHeader />
      <main className={styles.main}>
        {!configured ? <SetupNotice /> : null}
        <section className={`${styles.hero} spectrum-hero`}>
          <span className={styles.heroShade} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <span className={`kicker ${styles.heroKicker}`}>
              Short films · made outside the mainstream
            </span>
            <h1 className={styles.heroTitle}>
              The next great thing is still unknown.
            </h1>
            <p className={styles.heroLede}>
              Arcenray brings together short films by independent filmmakers
              and the creative people behind them. Watch their work and start a
              conversation.
            </p>
            <div className={styles.heroActions}>
              <Link href="/home" className="btn btn-primary">
                Explore films
              </Link>
              <Link href="/sign-up" className="btn btn-ghost">
                Join Us
              </Link>
            </div>
          </div>
          <div className={styles.heroMark}>
            <LogoTile className={styles.heroTile} />
          </div>
        </section>

        <section className={styles.promise} aria-labelledby="promise-title">
          <div
            className={`${styles.contour} ${styles.contourTop}`}
            aria-hidden="true"
          />
          <h2 id="promise-title" className={styles.promiseTitle}>
            Find your people.
            <br />
            <span className={styles.promiseAccent}>Make your art.</span>
          </h2>
          <ul className={styles.pillars}>
            <li>
              <span className="kicker">Watch</span>
              <p>
                Short films from directors, editors and crews who are just
                getting started.
              </p>
            </li>
            <li>
              <span className="kicker">Meet</span>
              <p>
                Profiles with every role you work in — director, editor,
                composer, colourist and more.
              </p>
            </li>
            <li>
              <span className="kicker">Make</span>
              <p>
                Message the people behind the work and build your next project
                together.
              </p>
            </li>
          </ul>
          <div
            className={`${styles.contour} ${styles.contourBottom}`}
            aria-hidden="true"
          />
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.footerMark}>arcenray.</span>
          <span className="kicker">
            For the work that hasn&apos;t been discovered yet
          </span>
          <nav aria-label="Legal">
            <Link href="/privacy">Privacy Policy</Link>
            {" · "}
            <Link href="/terms">Terms of Service</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
