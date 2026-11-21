import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useChatActivity } from "../../src/chat-activity";
import { chatPreview, isUnreadChat } from "../../src/chat-state";
import { Gate, useSession } from "../../src/session";
import { Avatar } from "../../src/visuals";
import { IconSearch } from "../../src/icons";
import {
  Screen,
  PageTitle,
  Kicker,
  Muted,
  Notice,
  Button,
  StatePanel,
  useResource,
  haptic,
} from "../../src/ui";
import { colors, fonts, radius } from "../../src/theme";

type ChatRow = {
  conversation_id: string;
  profile?: {
    id: string;
    full_name: string;
    handle: string;
    profile_pic_key: string | null;
  };
  last?: {
    body: string;
    sender_id: string;
    created_at: string;
    attachment_id: string | null;
  } | null;
  unread: boolean;
};

function when(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString())
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function Chats() {
  const { api, me } = useSession();
  const meId = me!.id;
  const [filter, setFilter] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const { snapshot, refresh, loading, error } = useChatActivity();
  const memberKey =
    snapshot?.receipts
      .map((row) => row.conversation_id)
      .sort()
      .join(",") ?? "";
  const loadProfiles = useCallback(async () => {
    if (!memberKey) return new Map<string, ChatRow["profile"]>();
    const others = await api!.supabase
      .from("conversation_participants")
      .select("conversation_id,user_id")
      .in("conversation_id", memberKey.split(","))
      .neq("user_id", meId);
    if (others.error) throw others.error;
    if (!others.data.length) return new Map<string, ChatRow["profile"]>();
    const profiles = await api!.supabase
      .from("profiles")
      .select("id,full_name,handle,profile_pic_key")
      .in(
        "id",
        others.data.map((row) => row.user_id),
      );
    if (profiles.error) throw profiles.error;
    const byId = new Map(profiles.data.map((row) => [row.id, row]));
    return new Map(
      others.data.map((row) => [row.conversation_id, byId.get(row.user_id)]),
    );
  }, [api, meId, memberKey]);
  const profiles = useResource(loadProfiles);
  const rows = useMemo(() => {
    const latest = new Map(
      snapshot?.messages.map((row) => [row.conversation_id, row]),
    );
    return (snapshot?.receipts ?? [])
      .map((receipt): ChatRow => {
        const id = receipt.conversation_id;
        const last = latest.get(id);
        return {
          conversation_id: id,
          profile: profiles.data?.get(id),
          last,
          unread: !!last && isUnreadChat(last, receipt.last_read_at, meId),
        };
      })
      .sort((a, b) =>
        (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""),
      );
  }, [meId, profiles.data, snapshot]);
  const filtered = rows.filter((c) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (
      (c.profile?.full_name ?? "").toLowerCase().includes(q) ||
      (c.profile?.handle ?? "").toLowerCase().includes(q) ||
      (c.last ? chatPreview(c.last.body, c.last.attachment_id) : "")
        .toLowerCase()
        .includes(q)
    );
  });

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            if (profiles.error) profiles.reload();
            void refresh().finally(() => setRefreshing(false));
          }}
          tintColor={colors.bone}
          colors={[colors.ember]}
          progressBackgroundColor={colors.graphite}
        />
      }
    >
      <View style={{ gap: 6 }}>
        <PageTitle size={38}>Chats</PageTitle>
        <Kicker color={colors.pink}>Private · one to one</Kicker>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          height: 44,
          paddingHorizontal: 16,
          borderRadius: 22,
          backgroundColor: colors.void,
          borderWidth: 1,
          borderColor: colors.line,
        }}
      >
        <IconSearch size={18} color={colors.faint} />
        <TextInput
          accessibilityLabel="Filter conversations"
          value={filter}
          onChangeText={setFilter}
          placeholder="Filter conversations"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          style={{
            flex: 1,
            minWidth: 0,
            color: colors.text,
            fontFamily: fonts.regular,
            fontSize: 14,
          }}
        />
      </View>

      {loading ? (
        <View style={{ gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                height: 76,
                borderRadius: radius.cardSm,
                backgroundColor: colors.graphite,
              }}
            />
          ))}
        </View>
      ) : null}
      <Notice message={error} retry={() => void refresh()} />
      <Notice message={profiles.error} retry={profiles.reload} />

      {!loading && !error && rows.length === 0 ? (
        <StatePanel
          title="No conversations yet"
          body="Find a creative and start a conversation from their profile or a film. Messages stay private between the two of you."
        >
          <Button
            title="Find people"
            onPress={() =>
              router.push({
                pathname: "/search",
                params: { kind: "profile", browse: String(Date.now()) },
              })
            }
          />
        </StatePanel>
      ) : null}

      {!loading && filtered.length === 0 && rows.length > 0 ? (
        <Muted>No conversation matches “{filter}”.</Muted>
      ) : null}

      {filtered.map((c) => (
        <Pressable
          key={c.conversation_id}
          accessibilityRole="link"
          accessibilityLabel={`${c.profile?.full_name ?? "Creative"}${c.unread ? ", unread message" : ""}`}
          onPress={() => {
            haptic();
            router.push({
              pathname: "/chat/[id]",
              params: { id: c.conversation_id },
            });
          }}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            padding: 14,
            borderRadius: radius.cardSm,
            backgroundColor: pressed ? colors.graphiteRaised : colors.graphite,
          })}
        >
          <Avatar
            picKey={c.profile?.profile_pic_key}
            name={c.profile?.full_name ?? "Creative"}
            size={48}
          />
          <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  color: colors.text,
                  fontFamily: c.unread ? fonts.extraBold : fonts.bold,
                  fontSize: 16,
                }}
              >
                {c.profile?.full_name ?? "Creative"}
              </Text>
              <Text
                style={{
                  color: colors.faint,
                  fontFamily: fonts.regular,
                  fontSize: 11,
                }}
              >
                {when(c.last?.created_at)}
              </Text>
            </View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  color: c.unread ? colors.chead : colors.muted,
                  fontFamily: fonts.regular,
                  fontSize: 13,
                }}
              >
                {c.last
                  ? chatPreview(c.last.body, c.last.attachment_id)
                  : "Start your conversation."}
              </Text>
              {c.unread ? (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.orange,
                  }}
                />
              ) : null}
            </View>
          </View>
        </Pressable>
      ))}
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
