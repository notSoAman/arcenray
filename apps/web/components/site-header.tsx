import Link from "next/link";
import { Lockup } from "./brand";
import styles from "./site-header.module.css";

/** Public header (welcome page). Signed-in screens use AppNav. */
export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Lockup />
        <nav aria-label="Account" className={styles.end}>
          <Link href="/discover" className={styles.textLink}>
            Discover
          </Link>
          <Link href="/sign-in" className={styles.textLink}>
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
