import { redirect } from "next/navigation";
import { getViewer } from "../../../lib/session";
import { ChatList } from "./chat-list";
import { ChatsShell } from "./chats-shell";
import { loadChats } from "./data";

export const dynamic = "force-dynamic";

/** Two panes on desktop (W7); list or thread on phones (08, 09). */
export default async function ChatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, user } = await getViewer();
  if (!user) redirect("/sign-in?next=%2Fchats");
  const chats = await loadChats(supabase, user.id);
  return <ChatsShell list={<ChatList chats={chats} />}>{children}</ChatsShell>;
}
