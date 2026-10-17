"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { IconSearch } from "../../../components/icons";
import { Avatar } from "../../../components/media";
import type { ChatRow } from "./data";
import styles from "./chats.module.css";

function when(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
    });
  const days = (now.getTime() - d.getTime()) / 86400000;
  if (days < 7) return d.toLocaleDateString("en-IN", { weekday: "short" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function ChatList({ chats }: { chats: ChatRow[] | null }) {
  const params = useParams<{ id?: string }>();
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const rows = (chats ?? []).filter(
    (c) =>
      !q ||
      c.other?.full_name.toLowerCase().includes(q) ||
      c.other?.handle.includes(q),
  );

  return (
    <aside aria-label="Conversations" className={styles.list}>
      <div className={styles.listHead}>
        <h1 className={styles.listTitle}>Chats</h1>
        <label className={styles.filter}>
          <IconSearch size={18} />
          <span className="visually-hidden">Search chats</span>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search people"
          />
        </label>
      </div>
      <div className={styles.rows}>
        {chats === null ? (
          <div className="state-panel" role="alert">
            <h2>Chats didn&apos;t load.</h2>
            <p>Check your connection and reload.</p>
          </div>
        ) : chats.length === 0 ? (
          <div className={`state-panel ${styles.emptyList}`}>
            <h2>No conversations yet</h2>
            <p>
              Message a filmmaker from their film or profile and it&apos;ll show
              up here.
            </p>
            <Link href="/loop" className="btn btn-primary">
              Find people
            </Link>
          </div>
        ) : rows.length === 0 ? (
          <p className={styles.noMatch}>No one matches “{filter}”.</p>
        ) : (
          rows.map((c) => {
            const name = c.other?.full_name ?? "Someone on arcenray";
            const current = params.id === c.id;
            return (
              <Link
                key={c.id}
                href={`/chats/${c.id}`}
                className={styles.row}
                aria-current={current ? "page" : undefined}
                data-unread={c.unread && !current ? "true" : undefined}
              >
                <Avatar
                  picKey={c.other?.profile_pic_key}
                  name={name}
                  size={48}
                />
                <span className={styles.rowBody}>
                  <span className={styles.rowTop}>
                    <span className={styles.rowName}>{name}</span>
                    <span className={styles.rowTime}>{when(c.lastAt)}</span>
                  </span>
                  <span className={styles.rowBottom}>
                    <span className={styles.preview}>
                      {c.lastBody
                        ? `${c.lastFromMe ? "You: " : ""}${c.lastBody}`
                        : "Say hello"}
                    </span>
                    {c.unread && !current ? (
                      <span className={styles.dot}>
                        <span className="visually-hidden">Unread</span>
                      </span>
                    ) : null}
                  </span>
                </span>
              </Link>
            );
          })
        )}
      </div>
    </aside>
  );
}
