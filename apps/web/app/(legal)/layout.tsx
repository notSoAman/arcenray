import Link from "next/link";
import { Lockup } from "../../components/brand";
import { legalContact } from "../../lib/legal";
import styles from "./legal.module.css";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#policy">
        Skip to policy
      </a>
      <header className={styles.header}>
        <Lockup />
        <Link href="/">Back to Arcenray</Link>
      </header>
      {children}
      <footer className={styles.footer}>
        <span>Find your people, make your art.</span>
        <nav aria-label="Legal and support">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
          <a href={`mailto:${legalContact.email}`}>Contact</a>
        </nav>
        <span>
          City suggestions use a filtered index of{" "}
          <a href="https://www.geonames.org/">GeoNames</a> data under{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
        </span>
      </footer>
    </div>
  );
}
