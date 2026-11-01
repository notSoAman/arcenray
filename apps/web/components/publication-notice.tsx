"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./publication-notice.module.css";

export function PublicationNotice() {
  const pathname = usePathname();
  const params = useSearchParams();
  const queued = pathname === "/home" && params.get("publication") === "queued";
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!queued) return;
    setVisible(true);
    // Consume the notice so refreshing or returning Home does not repeat it.
    const url = new URL(window.location.href);
    url.searchParams.delete("publication");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [queued]);
  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setVisible(false), 8000);
    return () => window.clearTimeout(timer);
  }, [visible]);
  if (!visible || pathname !== "/home") return null;
  return (
    <div className={styles.notice} role="status">
      <span>Your film will appear on Arcenray soon.</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}
