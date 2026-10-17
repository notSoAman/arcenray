"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { IconBack, IconPlay } from "../../../../components/icons";
import { Avatar, Poster } from "../../../../components/media";
import { browserApi, newId } from "../../../../lib/client-api";
import { formatDuration, type FeedCreator } from "../../../../lib/feed";
import { personRole } from "../../../../lib/roles";
import styles from "../chats.module.css";

export type ThreadMessage = {
  id: string;
  client_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  film_id: string | null;
};
export type ThreadFilm = {
  id: string;
  title: string;
  poster_key: string | null;
  duration_seconds: number | null;
  genres: string[];
};
type Local = ThreadMessage & { status?: "sending" | "failed" };

function merge(list: Local[], msg: Local) {
  const i = list.findIndex(
    (m) => m.id === msg.id || m.client_id === msg.client_id,
  );
  if (i === -1)
    return [...list, msg].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
  const next = list.slice();
  next[i] = { ...msg, status: undefined };
  return next;
}

/** One-to-one thread with Realtime delivery, optimistic send and retry. */
export function Thread({
  conversationId,
  me,
  other,
  initialMessages,
  films,
  loadFailed,
}: {
  conversationId: string;
  me: string;
  other: FeedCreator | null;
  initialMessages: ThreadMessage[];
  films: Record<string, ThreadFilm>;
  loadFailed: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Local[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState<"connecting" | "live" | "offline">(
    "connecting",
  );
  const scroller = useRef<HTMLDivElement>(null);
  const name = other?.full_name ?? "Someone on arcenray";
  const first = name.split(/\s+/)[0];

  // Live delivery: RLS restricts events to participants. Clean up on unmount.
  useEffect(() => {
    const supabase = browserApi().supabase;
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        ({ new: row }) =>
          setMessages((list) => merge(list, row as ThreadMessage)),
      )
      .subscribe((status) => {
        setLive(
          status === "SUBSCRIBED"
            ? "live"
            : status === "CLOSED"
              ? "connecting"
              : "offline",
        );
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Keep the newest message in view and mark the thread read.
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    void (async () => {
      await browserApi()
        .supabase.from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", me);
    })();
  }, [lastId, conversationId, me]);

  async function send(body: string, clientId = newId()) {
    const optimistic: Local = {
      id: clientId,
      client_id: clientId,
      sender_id: me,
      body,
      created_at: new Date().toISOString(),
      film_id: null,
      status: "sending",
    };
    setMessages((list) =>
      merge(
        list.filter((m) => m.client_id !== clientId),
        optimistic,
      ),
    );
    const { data, error } = await browserApi().chat.send({
      conversation_id: conversationId,
      body,
      client_id: clientId,
    });
    if (error || !data) {
      setMessages((list) =>
        list.map((m) =>
          m.client_id === clientId ? { ...m, status: "failed" } : m,
        ),
      );
      return;
    }
    setMessages((list) => merge(list, data as ThreadMessage));
    router.refresh();
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    void send(body.slice(0, 5000));
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <section className={styles.thread} aria-label={`Conversation with ${name}`}>
      <header className={styles.threadHead}>
        <Link href="/chats" className={styles.back} aria-label="Back to chats">
          <IconBack size={22} />
        </Link>
        <Avatar picKey={other?.profile_pic_key} name={name} size={44} />
        <span className={styles.threadWho}>
          <span className={styles.threadName}>{name}</span>
          <span className={styles.threadRole}>
            {[
              other?.roles.map(personRole).filter(Boolean)[0],
              other?.location_city,
            ]
              .filter(Boolean)
              .join(" · ") || (live === "offline" ? "Reconnecting…" : "")}
          </span>
        </span>
        {other ? (
          <Link
            href={`/u/${other.handle}`}
            className={`pill ${styles.viewProfile}`}
          >
            View profile
          </Link>
        ) : null}
      </header>

      <div ref={scroller} className={styles.messages} aria-live="polite">
        {loadFailed ? (
          <p className="field-error" role="alert">
            Older messages didn&apos;t load. New ones will still appear.
          </p>
        ) : null}
        {messages.length === 0 ? (
          <div className={styles.start}>
            <Avatar picKey={other?.profile_pic_key} name={name} size={72} />
            <p>
              This is the start of your conversation with {first}. Say what you
              liked about their work, or what you&apos;re making.
            </p>
          </div>
        ) : null}
        {messages.map((m) => {
          const mine = m.sender_id === me;
          const film = m.film_id ? films[m.film_id] : undefined;
          return (
            <div
              key={m.client_id || m.id}
              className={styles.msgWrap}
              data-mine={mine ? "true" : undefined}
            >
              <div
                className={styles.bubble}
                data-mine={mine ? "true" : undefined}
              >
                {m.body}
              </div>
              {film ? (
                <Link href={`/films/${film.id}`} className={styles.filmCard}>
                  <span className={styles.filmArt}>
                    <Poster
                      posterKey={film.poster_key}
                      title={film.title}
                      sizes="320px"
                    />
                    <span
                      className={`${styles.filmPlay} glass`}
                      aria-hidden="true"
                    >
                      <IconPlay size={16} />
                    </span>
                  </span>
                  <span className={styles.filmText}>
                    <span className={styles.filmTitle}>{film.title}</span>
                    <span className={styles.filmMeta}>
                      {[film.genres[0], formatDuration(film.duration_seconds)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </Link>
              ) : null}
              {m.status === "sending" ? (
                <span className={styles.msgState}>Sending…</span>
              ) : null}
              {m.status === "failed" ? (
                <span className={styles.msgState} data-failed="true">
                  Not sent ·{" "}
                  <button
                    type="button"
                    onClick={() => void send(m.body, m.client_id)}
                  >
                    Retry
                  </button>
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <form className={styles.composer} onSubmit={submit}>
        <label htmlFor="chat-draft" className="visually-hidden">
          Message {first}
        </label>
        <textarea
          id="chat-draft"
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={`Message ${first}`}
          maxLength={5000}
          className={styles.draft}
        />
        <button
          type="submit"
          className={styles.send}
          data-ready={draft.trim() ? "true" : undefined}
          disabled={!draft.trim()}
        >
          Send
        </button>
      </form>
    </section>
  );
}
