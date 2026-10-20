"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { IconMenu } from "./icons";
import styles from "./account-menu.module.css";
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div
      className={styles.menu}
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className={styles.button}
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <IconMenu size={24} />
      </button>
      {open ? (
        <nav id={id} className={styles.dropdown} aria-label="Account">
          <Link href="/settings" onClick={() => setOpen(false)}>
            Profile & settings
          </Link>
          <Link href="/invitations" onClick={() => setOpen(false)}>
            Credit invitations
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
