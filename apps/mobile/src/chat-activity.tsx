import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  Animated,
  AppState,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Database } from "@repo/shared";
import {
  bumpReceipts,
  chatPreview,
  isUnreadChat,
  overviewSnapshot,
  upsertLatestMessage,
  type ChatSnapshotMessage,
} from "./chat-state";
import { IconClose, IconMessage } from "./icons";
import { useSession } from "./session";
import { Avatar } from "./visuals";
import { haptic } from "./ui";
import { colors, fonts } from "./theme";

type Message = Database["public"]["Tables"]["messages"]["Row"];
type Receipt = { conversation_id: string; last_read_at: string };
type Snapshot = {
  receipts: Receipt[];
  peerReceipts: Receipt[];
  messages: ChatSnapshotMessage[];
};
type BannerProfile = {
  id: string;
  full_name: string | null;
  handle: string;
  profile_pic_key: string | null;
} | null;
type ActivityState = {
  snapshot: Snapshot;
  unreadCount: number;
  unreadFor: (conversation: string) => boolean;
  loading: boolean;
  error: string | null;
};
type ActivityActions = {
  refresh: () => Promise<void>;
  markConversationRead: (conversation: string, at: string) => void;
};

const ChatActivity = createContext<ActivityState>({
  snapshot: { receipts: [], peerReceipts: [], messages: [] },
  unreadCount: 0,
  unreadFor: () => false,
  loading: false,
  error: null,
});
const ChatActivityActions = createContext<ActivityActions>({
  refresh: async () => {},
  markConversationRead: () => {},
});

export function useChatActivity() {
  return useContext(ChatActivity);
}

export function useChatActivityActions() {
  return useContext(ChatActivityActions);
}

type Action =
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "insert"; message: ChatSnapshotMessage }
  | { type: "receipt"; conversation: string; at: string }
  | { type: "peerReceipt"; conversation: string; at: string }
  | { type: "clear" };

function reduce(snapshot: Snapshot, action: Action): Snapshot {
  switch (action.type) {
    case "snapshot":
      return action.snapshot;
    case "insert":
      return {
        ...snapshot,
        messages: upsertLatestMessage(snapshot.messages, action.message),
      };
    case "receipt":
      return {
        ...snapshot,
        receipts: bumpReceipts(
          snapshot.receipts,
          action.conversation,
          action.at,
        ),
      };
    case "peerReceipt":
      return {
        ...snapshot,
        peerReceipts: bumpReceipts(
          snapshot.peerReceipts,
          action.conversation,
          action.at,
        ),
      };
    case "clear":
      return { receipts: [], peerReceipts: [], messages: [] };
  }
}

export function ChatActivityProvider({ children }: PropsWithChildren) {
  const { api, me } = useSession();
  const userId = me?.onboarding_completed ? me.id : null;
  const path = usePathname();
  const { top } = useSafeAreaInsets();
  const openThread = path.match(/^\/chat\/([^/]+)$/)?.[1] ?? null;
  const openThreadRef = useRef(openThread);
  const [snapshot, dispatch] = useReducer(reduce, null, () => ({
    receipts: [],
    peerReceipts: [],
    messages: [],
  }));
  const snapshotRef = useRef<Snapshot>({
    receipts: [],
    peerReceipts: [],
    messages: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    message: ChatSnapshotMessage;
    profile: BannerProfile;
    fetching: boolean;
  } | null>(null);
  const refreshRef = useRef<ActivityActions["refresh"]>(async () => {});
  const markRef = useRef<ActivityActions["markConversationRead"]>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  const markConversationRead = useCallback(
    (conversation: string, at: string) => markRef.current(conversation, at),
    [],
  );
  const [slide] = useState(() => new Animated.Value(-104));

  useEffect(() => {
    openThreadRef.current = openThread;
  }, [openThread]);

  useEffect(() => {
    dispatch({ type: "clear" });
    snapshotRef.current = { receipts: [], peerReceipts: [], messages: [] };
  }, [userId]);

  useEffect(() => {
    if (!snapshot) return;
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (!api || !userId) return;
    const user = userId;
    let mounted = true;
    let pending: Promise<void> | null = null;
    let queued = false;

    async function fetchActivity() {
      if (!api || !userId || AppState.currentState === "background") return;
      try {
        const overview = await api.supabase.rpc("get_chat_overview");
        if (!mounted) return;
        if (overview.error) throw new Error();
        // One database snapshot: receipts and newest messages can never disagree.
        dispatch({ type: "snapshot", snapshot: overviewSnapshot(overview.data) });
        setError(null);
      } catch {
        if (mounted)
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

    function maybeAlert(message: ChatSnapshotMessage) {
      if (
        message.sender_id === user ||
        message.conversation_id === openThreadRef.current ||
        AppState.currentState !== "active"
      )
        return;
      const receipts = snapshotRef.current.receipts;
      const read = receipts.find(
        (receipt) => receipt.conversation_id === message.conversation_id,
      )?.last_read_at;
      if (read !== undefined && !isUnreadChat(message, read, user)) return;
      setBanner((current) => {
        if (current?.message.id === message.id) return current;
        return { message, profile: null, fetching: true };
      });
    }

    refreshRef.current = sync;
    void sync();
    const supabase = api.supabase;
    // Realtime applies each event directly — no refetch round-trip, so the
    // unread badge, preview line and banner update in one frame.
    const channel = supabase
      .channel(`native-inbox:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        ({ new: row }) => {
          const message = row as Message;
          if (
            !mounted ||
            typeof message.conversation_id !== "string" ||
            typeof message.id !== "string"
          )
            return;
          const latest: ChatSnapshotMessage = {
            id: message.id,
            client_id: message.client_id,
            conversation_id: message.conversation_id,
            sender_id: message.sender_id,
            body: message.body,
            attachment_id: message.attachment_id,
            created_at: message.created_at,
          };
          dispatch({ type: "insert", message: latest });
          maybeAlert(latest);
        },
      )
      .on(
        "postgres_changes",
        {
          // RLS limits rows to conversations the user belongs to; both sides'
          // receipts keep list-row ticks fresh without a refetch.
          event: "UPDATE",
          schema: "public",
          table: "conversation_participants",
        },
        ({ new: participant }) => {
          if (!mounted || typeof participant.last_read_at !== "string") return;
          dispatch({
            type: participant.user_id === userId ? "receipt" : "peerReceipt",
            conversation: participant.conversation_id,
            at: participant.last_read_at,
          });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void sync();
      });
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") void sync();
      else setBanner(null);
    });
    const interval = setInterval(() => {
      if (AppState.currentState === "active") void sync();
    }, 30_000);
    return () => {
      mounted = false;
      refreshRef.current = async () => {};
      clearInterval(interval);
      foreground.remove();
      void supabase.removeChannel(channel);
    };
  }, [api, userId]);

  // Local optimistic read receipts keep the badge, list and thread in lockstep;
  // the database write is fire-and-forget and reconciled by realtime.
  useEffect(() => {
    if (!api || !userId) return;
    markRef.current = (conversation, at) => {
      dispatch({ type: "receipt", conversation, at });
      setBanner((current) =>
        current?.message.conversation_id === conversation ? null : current,
      );
      void api!.supabase
        .from("conversation_participants")
        .update({ last_read_at: at })
        .eq("conversation_id", conversation)
        .eq("user_id", userId)
        .lt("last_read_at", at)
        .then(() => {}, () => {});
    };
  }, [api, userId]);

  // Resolve the banner's sender profile once per new message.
  useEffect(() => {
    if (!banner?.fetching || !api) return;
    let active = true;
    void api
      .supabase.from("profiles")
      .select("id,full_name,handle,profile_pic_key")
      .eq("id", banner.message.sender_id)
      .maybeSingle()
      .then((reply) => {
        if (!active || reply.error) return;
        setBanner((current) =>
          current?.message.id === banner.message.id
            ? { ...current, profile: reply.data, fetching: false }
            : current,
        );
      });
    return () => {
      active = false;
    };
  }, [api, banner]);

  // Slide the banner in and out; auto-dismiss so it never lingers. A banner for
  // the open thread is never set (the insert handler checks the open route) and
  // the thread's own read marking clears it, so no effect-side clearing is needed.
  useEffect(() => {
    if (!banner || banner.message.conversation_id === openThread)
      return undefined;
    Animated.spring(slide, {
      toValue: 0,
      useNativeDriver: true,
      speed: 24,
      bounciness: 4,
    }).start();
    const timer = setTimeout(() => {
      Animated.timing(slide, {
        toValue: -104,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => setBanner(null));
    }, 5200);
    return () => clearTimeout(timer);
  }, [banner, openThread, slide]);

  const receipts = useMemo(
    () =>
      new Map(
        snapshot.receipts.map((receipt) => [
          receipt.conversation_id,
          receipt.last_read_at,
        ]),
      ),
    [snapshot.receipts],
  );
  const unreadFor = useCallback(
    (conversation: string) => {
      const latest = snapshot.messages.find(
        (message) => message.conversation_id === conversation,
      );
      const read = receipts.get(conversation);
      return (
        latest !== undefined &&
        read !== undefined &&
        isUnreadChat(latest, read, userId ?? "")
      );
    },
    [receipts, snapshot.messages, userId],
  );
  const unreadCount = useMemo(
    () =>
      userId
        ? snapshot.messages.filter((message) => {
            const read = receipts.get(message.conversation_id);
            return read !== undefined && isUnreadChat(message, read, userId);
          }).length
        : 0,
    [receipts, snapshot.messages, userId],
  );
  const visible =
    banner && banner.message.conversation_id !== openThread ? banner : null;

  const state = useMemo<ActivityState>(
    () => ({
      snapshot,
      unreadCount,
      unreadFor,
      loading: !!userId && snapshot.messages.length === 0 && !error,
      error,
    }),
    [snapshot, unreadCount, unreadFor, userId, error],
  );
  const actions = useMemo<ActivityActions>(
    () => ({ refresh, markConversationRead }),
    [refresh, markConversationRead],
  );

  return (
    <ChatActivity.Provider value={state}>
      <ChatActivityActions.Provider value={actions}>
        <View style={styles.root}>
          {children}
        {visible ? (
          <Animated.View
            accessibilityLiveRegion="polite"
            style={[
              styles.banner,
              { top: top + 8, transform: [{ translateY: slide }] },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open message from ${
                visible.profile?.full_name ?? "a collaborator"
              }`}
              style={styles.open}
              onPress={() => {
                haptic();
                setBanner(null);
                router.push({
                  pathname: "/chat/[id]",
                  params: { id: visible.message.conversation_id },
                });
              }}
            >
              <Avatar
                picKey={visible.profile?.profile_pic_key}
                name={visible.profile?.full_name ?? "New message"}
                size={40}
              />
              <View style={styles.copy}>
                <Text style={styles.title} numberOfLines={1}>
                  {visible.profile?.full_name ??
                    visible.profile?.handle ??
                    "New message"}
                </Text>
                <Text style={styles.detail} numberOfLines={1}>
                  {chatPreview(
                    visible.message.body,
                    visible.message.attachment_id,
                  )}
                </Text>
              </View>
              <IconMessage color={colors.pink} size={22} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss message alert"
              style={styles.dismiss}
              onPress={() => setBanner(null)}
            >
              <IconClose color={colors.chead} />
            </Pressable>
          </Animated.View>
        ) : null}
        </View>
      </ChatActivityActions.Provider>
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
    paddingLeft: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.graphiteRaised,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  open: {
    flex: 1,
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 4,
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  title: { color: colors.bone, fontFamily: fonts.bold, fontSize: 15 },
  detail: { color: colors.chead, fontFamily: fonts.regular, fontSize: 13 },
  dismiss: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
