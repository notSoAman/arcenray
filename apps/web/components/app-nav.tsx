"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lockup } from "./brand";
import { IconChat, IconCompass, IconHome, IconSearch } from "./icons";
import { AccountMenu } from "./account-menu";
import { Avatar } from "./media";
import styles from "./app-nav.module.css";

type Viewer = { name: string; handle: string; picKey: string | null };

const sections = [
  { href: "/home", label: "Home", Icon: IconHome },
  { href: "/discover", label: "Discover", Icon: IconCompass },
  { href: "/search", label: "Search", Icon: IconSearch },
  { href: "/chats", label: "Chats", Icon: IconChat },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Desktop: sticky frosted header (web artboards). Phone width: compact top bar
 * plus the glass bottom tab bar from the mobile artboards.
 */
export function AppNav({ viewer }: { viewer: Viewer | null }) {
  const pathname = usePathname();
  const profileHref = viewer
    ? `/u/${viewer.handle}`
    : `/sign-in?next=${encodeURIComponent(pathname)}`;
  const onProfile =
    isActive(pathname, profileHref) || pathname === "/profile/edit";

  return (
    <>
      <header className={styles.header}>
        <div className={styles.inner}>
          <Lockup href="/home" />
          <nav aria-label="Main" className={styles.nav}>
            {sections
              .filter((s) => s.href !== "/search")
              .map((s) => (
                <Link
                  key={s.href}
                  href={
                    !viewer && s.href === "/chats"
                      ? "/sign-in?next=%2Fchats"
                      : s.href
                  }
                  className={styles.navLink}
                  aria-current={isActive(pathname, s.href) ? "page" : undefined}
                >
                  {s.label}
                </Link>
              ))}
          </nav>
          <Link
            href="/search"
            className={styles.searchPill}
            aria-current={isActive(pathname, "/search") ? "page" : undefined}
          >
            <IconSearch size={18} />
            <span>Search films and people</span>
          </Link>
          <Link
            href={profileHref}
            className={styles.me}
            aria-label={viewer ? "Your profile" : "Sign in"}
            aria-current={onProfile ? "page" : undefined}
          >
            {viewer ? (
              <Avatar
                picKey={viewer.picKey}
                name={viewer.name || viewer.handle}
                size={40}
              />
            ) : (
              <span>Sign in</span>
            )}
          </Link>
          {viewer && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
            <AccountMenu />
          ) : null}
        </div>
      </header>

      <nav aria-label="Main" className={`${styles.tabBar} glass`}>
        {sections.map(({ href, label, Icon }) => {
          const on = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={
                !viewer && href === "/chats" ? "/sign-in?next=%2Fchats" : href
              }
              className={styles.tab}
              aria-current={on ? "page" : undefined}
            >
              <Icon size={22} />
              <span>{label}</span>
            </Link>
          );
        })}
        <Link
          href={profileHref}
          className={styles.tab}
          aria-label={viewer ? "Profile" : "Sign in"}
          aria-current={onProfile ? "page" : undefined}
        >
          {viewer ? (
            <Avatar
              picKey={viewer.picKey}
              name={viewer.name || viewer.handle}
              size={30}
            />
          ) : (
            <span>Sign in</span>
          )}
        </Link>
      </nav>
    </>
  );
}
