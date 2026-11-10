import { useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Gate, useSession } from "../../src/session";
import { Avatar } from "../../src/visuals";
import {
  Screen,
  PageTitle,
  Kicker,
  Muted,
  Notice,
  Busy,
  Button,
  StatePanel,
  useResource,
} from "../../src/ui";
import { colors, fonts, radius } from "../../src/theme";

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
      .select("id,full_name,handle,profile_pic_key")
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
      <PageTitle>Conversations</PageTitle>
      <Kicker color={colors.pink}>Private · one to one</Kicker>
      {r.loading ? <Busy /> : null}
      <Notice message={r.error} retry={r.reload} />
      {r.data?.length === 0 ? (
        <StatePanel
          title="No conversations yet"
          body="Find a creative and start a conversation from their profile or a film."
        />
      ) : null}
      {r.data?.map((c) => (
        <Pressable
          key={c.conversation_id}
          accessibilityRole="link"
          onPress={() =>
            router.push({
              pathname: "/chat/[id]",
              params: { id: c.conversation_id },
            })
          }
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            padding: 14,
            borderRadius: radius.card,
            backgroundColor: colors.graphite,
          }}
        >
          <Avatar
            picKey={c.profile?.profile_pic_key}
            name={c.profile?.full_name ?? "Creative"}
            size={48}
          />
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {c.unread ? (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ember }} />
              ) : null}
              <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}>
                {c.profile?.full_name ?? "Creative"}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              style={{ color: c.unread ? colors.textSoft : colors.muted, fontFamily: fonts.regular, fontSize: 13 }}
            >
              {c.last?.body ?? "Start your conversation."}
            </Text>
          </View>
        </Pressable>
      ))}
      {r.data && r.data.length > 0 ? (
        <Button title="Refresh conversations" variant="ghost" onPress={r.reload} />
      ) : null}
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
