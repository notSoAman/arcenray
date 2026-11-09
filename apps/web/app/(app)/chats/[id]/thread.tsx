"use client";

import Link from "next/link";
import { ChatAttachment, AttachmentPicker, type ReadyAttachment } from "../../../../components/chat/attachment";
import {
  useEffect,
  useLayoutEffect,
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
  attachment_id?: string | null;
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
    (m) =>
      m.id === msg.id ||
      (m.sender_id === msg.sender_id && m.client_id === msg.client_id),
  );
  const next = list.slice();
  if (i === -1) next.push(msg);
  else next[i] = { ...msg, status: undefined };
  return next.sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}

/** RLS-scoped history uses a stable timestamp/ID cursor; older pages never mark new messages read. */
export function Thread({
  conversationId,
  me,
  other,
  initialMessages,
  initialHasOlder,
  films,
  loadFailed,
}: {
  conversationId: string;
  me: string;
  other: FeedCreator | null;
  initialMessages: ThreadMessage[];
  initialHasOlder: boolean;
  films: Record<string, ThreadFilm>;
  loadFailed: boolean;
}) {
  const [attachment, setAttachment] = useState<ReadyAttachment|null>(null);
  const [fileBusy,setFileBusy] = useState(false);
  const nearBottom = useRef(true);
  const [messages, setMessages] = useState<Local[]>(initialMessages);
  const [filmMap, setFilmMap] = useState(films);
  const [hasOlder, setHasOlder] = useState(initialHasOlder || loadFailed);
  const [historyError, setHistoryError] = useState(loadFailed);
  const [historyBusy, setHistoryBusy] = useState(false);
  const historyLock = useRef(false);
  const cursor = useRef(initialMessages[0] ?? null);
  const restoreScroll = useRef<{ height: number; top: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState<"connecting" | "live" | "offline">(
    "connecting",
  );
  const scroller = useRef<HTMLDivElement>(null);
  const name = other?.full_name ?? "Someone on arcenray";
  const first = name.split(/\s+/)[0];

  useLayoutEffect(() => {
    const previous = restoreScroll.current;
    if (previous && scroller.current) {
      scroller.current.scrollTop =
        previous.top + scroller.current.scrollHeight - previous.height;
      restoreScroll.current = null;
    }
  }, [messages]);

  async function loadOlder() {
    if (historyLock.current) return;
    historyLock.current = true;
    setHistoryBusy(true);
    setHistoryError(false);
    try {
      const db = browserApi().supabase;
      let query = db
        .from("messages")
        .select("id,client_id,sender_id,body,created_at,film_id,attachment_id")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(51);
      const before = cursor.current;
      if (before) {
        // Cursor values are server-returned timestamps and UUIDs, never user input.
        query = query.or(
          `created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`,
        );
      }
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []).slice(0, 50);
      const ids = [
        ...new Set(
          rows
            .map((row) => row.film_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (ids.length) {
        const { data: linkedFilms } = await db
          .from("films")
          .select("id,title,poster_key,duration_seconds,genres")
          .in("id", ids);
        setFilmMap((current) => ({
          ...current,
          ...Object.fromEntries(
            (linkedFilms ?? []).map((film) => [film.id, film]),
          ),
        }));
      }
      if (scroller.current && before)
        restoreScroll.current = {
          height: scroller.current.scrollHeight,
          top: scroller.current.scrollTop,
        };
      cursor.current = rows[rows.length - 1] ?? before;
      setHasOlder((data?.length ?? 0) > 50);
      setMessages((current) =>
        rows.reduce((list, row) => merge(list, row), current),
      );
    } catch {
      setHistoryError(true);
    } finally {
      historyLock.current = false;
      setHistoryBusy(false);
    }
  }

  // Live delivery: RLS restricts events to participants. Clean up on unmount.
  useEffect(() => {
    const supabase = browserApi().supabase;
    let active = true, syncing = false;
    let after = initialMessages.at(-1);
    const catchUp = async () => {
      if (!active || syncing || document.hidden) return;
      syncing = true;
      try {
        for (let page=0; page<20 && active; page++) {
          let query=supabase.from("messages").select("*").eq("conversation_id",conversationId)
            .order("created_at").order("id").limit(100);
          if(after) query=query.or(`created_at.gt.${after.created_at},and(created_at.eq.${after.created_at},id.gt.${after.id})`);
          const reply=await query;
          if(reply.error || !active) return;
          const rows=reply.data??[];
          setMessages(list=>rows.reduce((result,row)=>merge(result,row),list));
          if(rows.length)after=rows.at(-1);
          if(rows.length<100)return;
        }
      } finally { syncing=false; }
    };
    const wake=()=>void catchUp();
    document.addEventListener("visibilitychange",wake);
    window.addEventListener("online",wake);
    const timer=window.setInterval(wake,15000);
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
        if(status === "SUBSCRIBED")void catchUp();
        setLive(
          status === "SUBSCRIBED"
            ? "live"
            : status === "CLOSED"
              ? "connecting"
              : "offline",
        );
      });
    return () => {
      active=false;window.clearInterval(timer);
      document.removeEventListener("visibilitychange",wake);window.removeEventListener("online",wake);
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Keep the newest message in view and mark the thread read.
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if(nearBottom.current)scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    if(document.hidden)return;
    const latest=messages.filter(m=>!m.status).at(-1);
    if(!latest)return;
    void (async () => {
      await browserApi()
        .supabase.from("conversation_participants")
        .update({ last_read_at: latest.created_at })
        .eq("conversation_id", conversationId)
        .eq("user_id", me);
    })();
  }, [lastId, conversationId, me]);

  async function send(body: string, clientId = newId(), attachmentId: string|null = null) {
    nearBottom.current=true;
    const optimistic: Local = {
      id: clientId,
      client_id: clientId,
      sender_id: me,
      body,
      created_at: new Date().toISOString(),
      film_id: null,
      attachment_id: attachmentId,
      status: "sending",
    };
    setMessages((list) =>
      merge(
        list.filter((m) => m.sender_id !== me || m.client_id !== clientId),
        optimistic,
      ),
    );
    try {
    const { data, error } = await browserApi().chat.send({
      conversation_id: conversationId,
      body,
      client_id: clientId,
      attachment_id:attachmentId,
    });
    if (error || !data) {
      setMessages((list) =>
        list.map((m) =>
          m.sender_id === me && m.client_id === clientId
            ? { ...m, status: "failed" }
            : m,
        ),
      );
      return;
    }
    setMessages((list) => merge(list, data as ThreadMessage));
    } catch {
      setMessages(list=>list.map(m=>m.sender_id===me&&m.client_id===clientId?{...m,status:"failed"}:m));
    }
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if(fileBusy)return;
    const body = draft.trim() || attachment?.name || "";
    if (!body) return;
    setDraft("");
    const id=attachment?.id??null;setAttachment(null);
    void send(body.slice(0, 5000),newId(),id);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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

      <div ref={scroller} className={styles.messages} aria-live="polite" onScroll={()=>{const el=scroller.current;if(el)nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<100}}>
        {hasOlder || historyError ? (
          <button
            type="button"
            className="pill"
            disabled={historyBusy}
            onClick={() => void loadOlder()}
          >
            {historyBusy
              ? "Loading older messages…"
              : historyError
                ? "Retry loading messages"
                : "Load older messages"}
          </button>
        ) : null}
        {historyError ? (
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
          const film = m.film_id ? filmMap[m.film_id] : undefined;
          return (
            <div
              key={`${m.sender_id}:${m.client_id || m.id}`}
              className={styles.msgWrap}
              data-mine={mine ? "true" : undefined}
            >
              <div
                className={styles.bubble}
                data-mine={mine ? "true" : undefined}
              >
                {m.body}
              </div>
              {m.attachment_id ? <ChatAttachment id={m.attachment_id}/> : null}
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
                    onClick={() => void send(m.body, m.client_id, m.attachment_id??null)}
                  >
                    Retry
                  </button>
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="chat-tools">
        <AttachmentPicker conversationId={conversationId} onReady={setAttachment} onBusy={setFileBusy} disabled={fileBusy}/>
        {attachment?<span>{attachment.name} <button type="button" onClick={()=>setAttachment(null)}>Remove</button></span>:null}
        <div aria-label="Emojis">{["😀","❤️","👏","🎬","🔥","🙏"].map(emoji=><button className="pill" type="button" key={emoji} aria-label={`Add ${emoji}`} onClick={()=>setDraft(text=>text+emoji)}>{emoji}</button>)}</div>
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
          disabled={fileBusy||(!draft.trim()&&!attachment)}
        >
          Send
        </button>
      </form>
    </section>
  );
}
