"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import styles from "./chats.module.css";

export function ChatsShell({
  list,
  children,
}: {
  list: React.ReactNode;
  children: React.ReactNode;
}) {
  const segment = useSelectedLayoutSegment();
  return (
    <main className={styles.shell} data-open={segment ? "thread" : "list"}>
      <div className={styles.listPane}>{list}</div>
      <div className={styles.threadPane}>{children}</div>
    </main>
  );
}
