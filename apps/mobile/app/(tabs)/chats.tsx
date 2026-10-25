import { useCallback } from "react";
import { Gate, useSession } from "../../src/session";
import {
  Screen,
  Title,
  Muted,
  Copy,
  Panel,
  Nav,
  Notice,
  Busy,
  Button,
  useResource,
} from "../../src/ui";
function Chats() {
  const { api, me } = useSession();
  const load = useCallback(async () => {
    const [mine, summaries] = await Promise.all([
      api!.supabase
        .from("conversation_participants")
        .select("conversation_id,last_read_at")
        .eq("user_id", me!.id),
      api!.supabase.rpc("get_chat_summaries"),
    ]);
    if (mine.error || summaries.error) throw mine.error ?? summaries.error;
    const ids = (mine.data ?? []).map((x) => x.conversation_id);
    if (!ids.length) return [];
    const others = await api!.supabase
      .from("conversation_participants")
      .select("conversation_id,user_id")
      .in("conversation_id", ids)
      .neq("user_id", me!.id);
    if (others.error) throw others.error;
    const profiles = await api!.supabase
      .from("profiles")
      .select("id,full_name,handle")
      .in(
        "id",
        (others.data ?? []).map((x) => x.user_id),
      );
    if (profiles.error) throw profiles.error;
    return (mine.data ?? [])
      .map((c) => {
        const other = others.data?.find(
          (x) => x.conversation_id === c.conversation_id,
        );
        const profile = profiles.data?.find((p) => p.id === other?.user_id);
        const last = summaries.data?.find(
          (x) => x.conversation_id === c.conversation_id,
        );
        return {
          ...c,
          profile,
          last,
          unread:
            !!last &&
            last.sender_id !== me!.id &&
            last.created_at > c.last_read_at,
        };
      })
      .sort((a, b) =>
        (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""),
      );
  }, [api, me]);
  const r = useResource(load);
  return (
    <Screen>
      <Title>Conversations</Title>
      {r.loading ? <Busy /> : null}
      <Notice message={r.error} retry={r.reload} />
      {r.data?.length === 0 ? (
        <Muted>
          Find a creative and start a conversation from their profile.
        </Muted>
      ) : null}
      {r.data?.map((c) => (
        <Panel key={c.conversation_id}>
          <Copy>
            {c.unread ? "● " : ""}
            {c.profile?.full_name ?? "Creative"}
          </Copy>
          <Muted>{c.last?.body ?? "Start your conversation."}</Muted>
          <Nav
            title="Open conversation"
            href={{ pathname: "/chat/[id]", params: { id: c.conversation_id } }}
          />
        </Panel>
      ))}
      <Button title="Refresh conversations" secondary onPress={r.reload} />
    </Screen>
  );
}
export default function Route() {
  return (
    <Gate>
      <Chats />
    </Gate>
  );
}
