import { useCallback, useEffect, useState, useRef } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { uuidSchema, type Database } from "@repo/shared";
import { Gate, useSession } from "../../src/session";
import {
  Screen,
  Title,
  Muted,
  Copy,
  Panel,
  Field,
  Button,
  Notice,
  Busy,
  Nav,
  useResource,
  useAction,
} from "../../src/ui";
type Message = Database["public"]["Tables"]["messages"]["Row"];
function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, me } = useSession();
  const [text, setText] = useState("");
  const [live, setLive] = useState("connecting");
  const [incoming, setIncoming] = useState<Message[]>([]);
  const [older, setOlder] = useState<Message[]>([]);
  const pending = useRef<{ text: string; id: string } | null>(null);
  const a = useAction();
  const load = useCallback(async () => {
    uuidSchema.parse(id);
    const membership = await api!.supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", id)
      .eq("user_id", me!.id)
      .maybeSingle();
    if (membership.error || !membership.data)
      throw new Error("Conversation unavailable");
    const r = await api!.chat.messages(id);
    if (r.error) throw r.error;
    return r.data ?? [];
  }, [api, id, me]);
  const r = useResource(load);
  const ready = !!r.data;
  useEffect(() => {
    if (!api || !ready) return;
    const channel = api.supabase
      .channel(`native-messages:${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          setIncoming((old) => [
            ...old.filter((x) => x.id !== payload.new.id),
            payload.new as Message,
          ]);
        },
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED" ? "live" : "reconnecting");
      });
    return () => {
      void api.supabase.removeChannel(channel);
    };
  }, [api, id, ready]);
  const messages = [
    ...new Map(
      [...older, ...(r.data ?? []), ...incoming].map((x) => [x.id, x]),
    ).values(),
  ].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  return (
    <Screen>
      <Title>Conversation</Title>
      <Muted>{live} · private to participants</Muted>
      {r.loading ? <Busy /> : null}
      <Notice message={r.error} retry={r.reload} />
      {ready ? (
        <>
          <Button
            title="Load older messages"
            secondary
            disabled={a.busy || !messages.length}
            onPress={() =>
              a.run(async () => {
                const first = messages[0]!;
                const x = await api!.supabase
                  .from("messages")
                  .select("*")
                  .eq("conversation_id", id)
                  .lt("created_at", first.created_at)
                  .order("created_at", { ascending: false })
                  .limit(50);
                if (x.error) throw x.error;
                setOlder((old) => [...x.data, ...old]);
              })
            }
          />
          {messages.map((m) => (
            <Panel key={m.id}>
              <Muted>
                {m.sender_id === me!.id ? "You" : "Creative"} ·{" "}
                {new Date(m.created_at).toLocaleString()}
              </Muted>
              <Copy>{m.body}</Copy>
              {m.film_id ? (
                <Nav
                  title="Attached film"
                  href={{ pathname: "/film/[id]", params: { id: m.film_id } }}
                />
              ) : null}
            </Panel>
          ))}
          <Field
            label="Message"
            multiline
            maxLength={5000}
            value={text}
            onChangeText={setText}
            editable={!a.busy}
          />
          <Button
            title={a.busy ? "Sending…" : "Send"}
            disabled={a.busy || !text.trim()}
            onPress={() =>
              a.run(async () => {
                if (!pending.current || pending.current.text !== text)
                  pending.current = { text, id: Crypto.randomUUID() };
                const x = await api!.chat.send({
                  conversation_id: id,
                  body: text.trim(),
                  client_id: pending.current.id,
                });
                if (x.error && x.error.code !== "23505") throw x.error;
                setText("");
                pending.current = null;
                if (x.data)
                  setIncoming((old) => [
                    ...old.filter((m) => m.id !== x.data.id),
                    x.data,
                  ]);
                r.reload();
              })
            }
          />
          <Button
            title="Mark as read"
            secondary
            onPress={() =>
              a.run(async () => {
                const x = await api!.supabase
                  .from("conversation_participants")
                  .update({ last_read_at: new Date().toISOString() })
                  .eq("conversation_id", id)
                  .eq("user_id", me!.id);
                if (x.error) throw x.error;
              })
            }
          />
        </>
      ) : null}
      <Notice message={a.error} />
    </Screen>
  );
}
export default function Route() {
  return (
    <Gate>
      <Thread />
    </Gate>
  );
}
