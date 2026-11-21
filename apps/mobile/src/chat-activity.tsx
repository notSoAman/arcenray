import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Database } from "@repo/shared";
import { isUnreadChat, newestChatAlert } from "./chat-state";
import { IconClose, IconMessage } from "./icons";
import { useSession } from "./session";
import { colors, fonts } from "./theme";

type Message = Database["public"]["Tables"]["messages"]["Row"];
type Receipt = { conversation_id: string; last_read_at: string };
type Snapshot = { receipts: Receipt[]; messages: Message[] };
type Activity = {
  snapshot: Snapshot | null;
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const ChatActivity = createContext<Activity>({
  snapshot: null,
  unreadCount: 0,
  loading: false,
  error: null,
  refresh: async () => {},
});

export function useChatActivity() {
  return useContext(ChatActivity);
}

export function ChatActivityProvider({ children }: PropsWithChildren) {
  const { api, me } = useSession();
  const userId = me?.onboarding_completed ? me.id : null;
  const path = usePathname();
  const { top } = useSafeAreaInsets();
  const openThread = path.match(/^\/chat\/([^/]+)$/)?.[1] ?? null;
  const openThreadRef = useRef(openThread);
  const prev = useRef<Snapshot | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alert, setAlert] = useState<Message | null>(null);
  const refreshRef = useRef<Activity["refresh"]>(async () => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  useEffect(() => {
    openThreadRef.current = openThread;
  }, [openThread]);

  useEffect(() => {
    if (!api || !userId) return;
    let mounted = true;
    let pending: Promise<void> | null = null;
    let queued = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    async function fetchActivity() {
      if (!api || !userId || AppState.currentState === "background") return;
      try {
        const [receipts, messages] = await Promise.all([
          api.supabase
            .from("conversation_participants")
            .select("conversation_id,last_read_at")
            .eq("user_id", userId),
          api.supabase.rpc("get_chat_summaries"),
        ]);
        if (!mounted) return;
        if (receipts.error || messages.error) throw new Error();
        const activity = { receipts: receipts.data, messages: messages.data };
        const lastRead = new Map(
          activity.receipts.map((row) => [
            row.conversation_id,
            row.last_read_at,
          ]),
        );
        if (prev.current && AppState.currentState === "active") {
          const incoming = newestChatAlert(
            activity.messages,
            prev.current.messages,
            lastRead,
            userId,
            openThreadRef.current,
          );
          setAlert((current) => {
            if (incoming) return incoming;
            const read = current && lastRead.get(current.conversation_id);
            return current && read && isUnreadChat(current, read, userId)
              ? current
              : null;
          });
        }
        prev.current = activity;
        setError(null);
        setSnapshot(activity);
      } catch {
        if (mounted && !prev.current)
          setError("Couldn’t load chats. Check your connection and try again.");
      }
    }

    function sync(): Promise<void> {
      if (!mounted) return Promise.resolve();
      if (pending) {
        queued = true;
        return pending;
      }
      pending = fetchActivity().finally(() => {
        pending = null;
        if (!queued) return;
        queued = false;
        void sync();
      });
      return pending;
    }

    function schedule() {
      clearTimeout(debounce);
      debounce = setTimeout(() => void sync(), 250);
    }

    refreshRef.current = sync;
    void Promise.resolve().then(sync);
    const supabase = api.supabase;
    // Postgres Changes applies the existing membership RLS before emitting rows.
    const channel = supabase
      .channel(`native-inbox:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        schedule,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_participants",
          filter: `user_id=eq.${userId}`,
        },
        schedule,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") schedule();
      });
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") void sync();
      else setAlert(null);
    });
    const interval = setInterval(() => {
      if (AppState.currentState === "active") void sync();
    }, 20_000);
    return () => {
      mounted = false;
      refreshRef.current = async () => {};
      clearTimeout(debounce);
      clearInterval(interval);
      foreground.remove();
      void supabase.removeChannel(channel);
    };
  }, [api, userId]);

  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => setAlert(null), 6500);
    return () => clearTimeout(timer);
  }, [alert]);

  const visible = alert && alert.conversation_id !== openThread ? alert : null;
  const receipts = new Map(
    snapshot?.receipts.map((row) => [row.conversation_id, row.last_read_at]),
  );
  const unreadCount = userId
    ? (snapshot?.messages.filter((message) => {
        const read = receipts.get(message.conversation_id);
        return read !== undefined && isUnreadChat(message, read, userId);
      }).length ?? 0)
    : 0;

  return (
    <ChatActivity.Provider
      value={{
        snapshot,
        unreadCount,
        error,
        loading: !!userId && !snapshot && !error,
        refresh,
      }}
    >
      <View style={styles.root}>
        {children}
        {visible ? (
          <View style={[styles.banner, { top: top + 8 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLiveRegion="polite"
              style={styles.open}
              onPress={() => {
                setAlert(null);
                router.push({
                  pathname: "/chat/[id]",
                  params: { id: visible.conversation_id },
                });
              }}
            >
              <IconMessage color={colors.pink} size={22} />
              <View style={styles.copy}>
                <Text style={styles.title}>New message</Text>
                <Text style={styles.detail}>Open conversation</Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss message alert"
              style={styles.dismiss}
              onPress={() => setAlert(null)}
            >
              <IconClose color={colors.chead} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </ChatActivity.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  banner: {
    position: "absolute",
    left: 12,
    right: 12,
    elevation: 8,
    zIndex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.graphiteRaised,
  },
  open: {
    flex: 1,
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 4,
  },
  copy: { flex: 1, gap: 2 },
  title: { color: colors.bone, fontFamily: fonts.bold, fontSize: 15 },
  detail: { color: colors.chead, fontFamily: fonts.regular, fontSize: 13 },
  dismiss: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
