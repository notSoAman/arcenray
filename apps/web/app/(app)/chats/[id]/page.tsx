import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FILM_COLUMNS, loadProfiles } from "../../../../lib/feed";
import { getViewer } from "../../../../lib/session";
import { Thread, type ThreadFilm, type ThreadMessage } from "./thread";

export const metadata: Metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await getViewer();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/chats/${id}`)}`);
  if (!uuid.test(id)) notFound();

  // Membership is enforced by RLS: a non-member sees no participants.
  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", id);
  if (!participants?.some((p) => p.user_id === user.id)) notFound();
  const otherId =
    participants.find((p) => p.user_id !== user.id)?.user_id ?? null;

  const [profiles, messages] = await Promise.all([
    loadProfiles(supabase, otherId ? [otherId] : []),
    supabase
      .from("messages")
      .select("id,client_id,sender_id,body,created_at,film_id")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(51),
  ]);
  const rows: ThreadMessage[] = (messages.data ?? []).slice(0, 50).reverse();
  const filmIds = [
    ...new Set(
      rows.map((m) => m.film_id).filter((f): f is string => Boolean(f)),
    ),
  ];
  const { data: films } = filmIds.length
    ? await supabase.from("films").select(FILM_COLUMNS).in("id", filmIds)
    : { data: [] };
  const filmMap: Record<string, ThreadFilm> = {};
  for (const f of films ?? [])
    filmMap[f.id] = {
      id: f.id,
      title: f.title,
      poster_key: f.poster_key,
      duration_seconds: f.duration_seconds,
      genres: f.genres,
    };

  return (
    <Thread
      key={id}
      conversationId={id}
      me={user.id}
      other={otherId ? (profiles.get(otherId) ?? null) : null}
      initialMessages={rows}
      initialHasOlder={(messages.data?.length ?? 0) > 50}
      films={filmMap}
      loadFailed={Boolean(messages.error)}
    />
  );
}
