"use client";
import Link from "next/link";
import { IconMenu } from "./icons";
import styles from "./account-menu.module.css";
export function AccountMenu() {
  return (
    <Link
      href="/settings"
      className={styles.button}
      aria-label="Settings"
      title="Settings"
    >
      <IconMenu size={24} />
    </Link>
  );
}
