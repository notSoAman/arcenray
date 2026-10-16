import Link from "next/link";
import { Lockup } from "./brand";
import { SignOutButton } from "./sign-out-button";
import styles from "./site-header.module.css";

type Props =
  | { variant: "public" }
  | {
      variant: "app";
      current: "home";
      name: string;
      handle: string;
    };

/**
 * Sticky frosted header from the web artboards. Only routes that exist are
 * linked: Discover, Search and Chats join the nav when those screens ship.
 */
export function SiteHeader(props: Props) {
  if (props.variant === "public") {
    return (
      <header className={styles.header}>
        <div className={styles.inner}>
          <Lockup />
          <nav aria-label="Account" className={styles.end}>
            <Link href="/sign-in" className={styles.textLink}>
              Sign in
            </Link>
          </nav>
        </div>
      </header>
    );
  }

  const initial = (props.name || props.handle).trim().charAt(0).toUpperCase();
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Lockup href="/home" />
        <nav aria-label="Main" className={styles.nav}>
          <Link
            href="/home"
            className={styles.navLink}
            aria-current={props.current === "home" ? "page" : undefined}
          >
            Home
          </Link>
        </nav>
        <div className={styles.end}>
          <span className={styles.who}>
            <span className={styles.avatar} aria-hidden="true">
              {initial || "a"}
            </span>
            <span className={styles.whoText}>
              <span className={styles.whoName}>{props.name}</span>
              <span className={styles.whoHandle}>@{props.handle}</span>
            </span>
          </span>
          <SignOutButton className={styles.textButton} />
        </div>
      </div>
    </header>
  );
}
