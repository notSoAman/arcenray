import "server-only";
import {
  loadProfiles,
  type FeedCreator,
  type Supabase,
} from "../../../lib/feed";

export type ChatRow = {
  id: string;
  other: FeedCreator | null;
  lastBody: string | null;
  lastAt: string | null;
  lastFromMe: boolean;
  unread: boolean;
};

/** The signed-in person's conversations, newest activity first. RLS limits rows to members. */
export async function loadChats(
  supabase: Supabase,
  me: string,
): Promise<ChatRow[] | null> {
  const { data: mine, error } = await supabase
    .from("conversation_participants")
    .select("conversation_id,last_read_at")
    .eq("user_id", me);
  if (error) return null;
  const ids = (mine ?? []).map((m) => m.conversation_id);
  if (ids.length === 0) return [];

  const [others, messages] = await Promise.all([
    supabase
      .from("conversation_participants")
      .select("conversation_id,user_id")
      .in("conversation_id", ids)
      .neq("user_id", me),
    supabase.rpc("get_chat_summaries"),
  ]);
  if (others.error || messages.error) return null;
  const otherBy = new Map(
    (others.data ?? []).map((o) => [o.conversation_id, o.user_id]),
  );
  const profiles = await loadProfiles(supabase, [...otherBy.values()]);
  const lastBy = new Map<
    string,
    { sender_id: string; body: string; created_at: string }
  >();
  for (const m of messages.data ?? [])
    if (!lastBy.has(m.conversation_id)) lastBy.set(m.conversation_id, m);
  const readBy = new Map(
    (mine ?? []).map((m) => [m.conversation_id, m.last_read_at]),
  );

  return ids
    .map((id) => {
      const last = lastBy.get(id);
      const otherId = otherBy.get(id);
      const readAt = readBy.get(id);
      return {
        id,
        other: otherId ? (profiles.get(otherId) ?? null) : null,
        lastBody: last?.body ?? null,
        lastAt: last?.created_at ?? null,
        lastFromMe: last?.sender_id === me,
        unread: Boolean(
          last &&
          last.sender_id !== me &&
          (!readAt || last.created_at > readAt),
        ),
      };
    })
    .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}
