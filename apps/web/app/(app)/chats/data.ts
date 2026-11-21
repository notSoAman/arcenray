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

/**
 * The signed-in person's conversations, newest activity first. RLS limits rows
 * to members. One get_chat_overview snapshot supplies receipts and newest
 * messages together, so the unread dot can never disagree with the preview.
 */
export async function loadChats(
  supabase: Supabase,
  me: string,
): Promise<ChatRow[] | null> {
  const overview = await supabase.rpc("get_chat_overview");
  if (overview.error || !overview.data) return null;
  const rows = overview.data;
  if (rows.length === 0) return [];

  const others = await supabase
    .from("conversation_participants")
    .select("conversation_id,user_id")
    .in(
      "conversation_id",
      rows.map((row) => row.conversation_id),
    )
    .neq("user_id", me);
  if (others.error) return null;
  const otherBy = new Map(
    (others.data ?? []).map((o) => [o.conversation_id, o.user_id]),
  );
  const profiles = await loadProfiles(supabase, [...otherBy.values()]);

  return rows
    .map((row) => {
      const last = row.last_message_id
        ? {
            sender_id: row.last_message_sender_id!,
            body: row.last_message_body!,
            created_at: row.last_message_created_at!,
          }
        : null;
      const otherId = otherBy.get(row.conversation_id);
      return {
        id: row.conversation_id,
        other: otherId ? (profiles.get(otherId) ?? null) : null,
        lastBody: last?.body ?? null,
        lastAt: last?.created_at ?? null,
        lastFromMe: last?.sender_id === me,
        unread: Boolean(
          last &&
            last.sender_id !== me &&
            last.created_at > row.last_read_at,
        ),
      };
    })
    .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}
