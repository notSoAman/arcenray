import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import {
  Animated,
  AppState,
  Easing,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { uuidSchema, type Database } from "@repo/shared";
import { Gate, useSession } from "../../src/session";
import { Avatar } from "../../src/visuals";
import { useChatActivityActions } from "../../src/chat-activity";
import {
  mergeChatMessages,
  chatCursorAfter,
  chatFileLimit,
  chatFileType,
  shouldSendTyping,
  typingChannel,
  typingExpiryMs,
  voiceNoteLimitMs,
  voiceNoteName,
  voiceNoteTime,
} from "../../src/chat-state";
import {
  ChatAttachment,
  AudioClip,
  uploadChatFile,
  type SelectedChatFile,
} from "../../src/chat-attachment";
import {
  IconCheck,
  IconCheckDouble,
  IconChevronDown,
  IconChevronLeft,
  IconClock,
  IconMic,
  IconPlus,
  IconSend,
  IconStop,
  IconSmile,
} from "../../src/icons";
import { Button, Notice, Busy, Nav, haptic } from "../../src/ui";
import { colors, fonts } from "../../src/theme";

type Message = Database["public"]["Tables"]["messages"]["Row"];
type Local = Message & { delivery?: "sending" | "failed" };
type Peer = {
  id: string;
  full_name: string;
  handle: string;
  profile_pic_key: string | null;
};
const voiceRecording = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64_000,
};
const keepPosition = { minIndexForVisible: 0, autoscrollToTopThreshold: 44 };
const emojis = ["😊", "❤️", "👏", "🔥", "🎬", "🙏", "👍", "✨"];
const groupWindowMs = 4 * 60 * 1000;
const nearBottomOffset = 44;

/* --------------------------------------------------------------- indicators */

function TypingDots({ color = colors.pink }: { color?: string }) {
  const [dots] = useState(() => [
    new Animated.Value(0.35),
    new Animated.Value(0.35),
    new Animated.Value(0.35),
  ]);
  useEffect(() => {
    const loop = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 160),
          Animated.timing(dot, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.35,
            duration: 300,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loop.forEach((animation) => animation.start());
    return () => loop.forEach((animation) => animation.stop());
  }, [dots]);
  return (
    <View style={s.typingRow} accessibilityLabel="typing">
      {dots.map((dot, index) => (
        <Animated.View
          key={index}
          style={[s.typingDot, { backgroundColor: color, opacity: dot }]}
        />
      ))}
    </View>
  );
}

/** Clock while queued, one check once stored, two ember checks when read. */
function DeliveryGlyph({
  state,
  size = 13,
}: {
  state: "sending" | "sent" | "seen";
  size?: number;
}) {
  const ink = "rgba(14,15,14,0.55)";
  if (state === "sending") return <IconClock size={size} color={ink} />;
  if (state === "sent") return <IconCheck size={size} color={ink} />;
  return <IconCheckDouble size={size} color={colors.ember} />;
}

function DayChip({ label }: { label: string }) {
  return (
    <View style={s.dayChip}>
      <Text style={s.dayText}>{label}</Text>
    </View>
  );
}

function dayTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(date: Date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ----------------------------------------------------------------- messages */

const MessageRow = memo(function MessageRow({
  row,
  mine,
  groupedAbove,
  groupedBelow,
  peerReadAt,
  activeAudio,
  onAudio,
  api,
  onRetry,
}: {
  row: Local;
  mine: boolean;
  groupedAbove: boolean;
  groupedBelow: boolean;
  peerReadAt: string;
  activeAudio: string | null;
  onAudio: (id: string) => void;
  api: NonNullable<ReturnType<typeof useSession>["api"]>;
  onRetry: (row: Local) => void;
}) {
  const [appear] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 170,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    // Rows recycled by the list re-run this effect; the fade stays subtle.
    return () => appear.setValue(0);
  }, [appear]);
  const date = new Date(row.created_at);
  const failed = row.delivery === "failed";
  const delivery: "sending" | "sent" | "seen" | undefined =
    row.delivery === "sending"
      ? "sending"
      : failed || !mine
        ? undefined
        : peerReadAt !== "" && row.created_at <= peerReadAt
          ? "seen"
          : "sent";
  const ink = mine ? colors.void : colors.bone;
  const timeInk = mine ? "rgba(14,15,14,0.45)" : "rgba(243,239,233,0.5)";
  return (
    <Animated.View
      style={[
        s.message,
        groupedAbove ? s.messageGrouped : s.messageFirst,
        { opacity: appear },
      ]}
    >
      <View
        style={[
          s.bubble,
          mine ? s.mine : s.theirs,
          groupedAbove
            ? mine
              ? s.mineContinuedTop
              : s.theirsContinuedTop
            : undefined,
          groupedBelow
            ? mine
              ? s.mineContinuedBottom
              : s.theirsContinuedBottom
            : undefined,
        ]}
      >
        {row.attachment_id ? (
          <ChatAttachment
            id={row.attachment_id}
            body={row.body}
            mine={mine}
            api={api}
            activeAudio={activeAudio}
            onAudio={onAudio}
          />
        ) : (
          <Text style={[s.text, { color: ink }]} selectable>
            {row.body}
          </Text>
        )}
        {row.film_id ? (
          <Nav
            title="View attached film"
            href={{ pathname: "/film/[id]", params: { id: row.film_id } }}
          />
        ) : null}
        <View style={s.metaRow}>
          <Text style={[s.time, { color: timeInk }]}>{dayTime(date)}</Text>
          {delivery ? (
            <View style={{ marginLeft: 3 }}>
              <DeliveryGlyph state={delivery} />
            </View>
          ) : null}
        </View>
        {failed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry sending this message"
            style={s.retry}
            onPress={() => onRetry(row)}
          >
            <Text style={{ color: colors.orange, fontFamily: fonts.semibold }}>
              Couldn’t send · Retry
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
});

/* ------------------------------------------------------------------ header */

const ThreadHeader = memo(function ThreadHeader({
  other,
  typing,
  recording,
  onBack,
  onOpenProfile,
}: {
  other: Peer | null;
  typing: boolean;
  recording: boolean;
  onBack: () => void;
  onOpenProfile: () => void;
}) {
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to chats"
        onPress={onBack}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
        style={s.back}
      >
        <IconChevronLeft size={24} color={colors.bone} />
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={
          other ? `Open ${other.full_name}’s profile` : "Conversation"
        }
        disabled={!other}
        onPress={onOpenProfile}
        style={s.headerIdentity}
      >
        {other ? (
          <Avatar
            picKey={other.profile_pic_key}
            name={other.full_name}
            size={40}
          />
        ) : null}
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text style={s.headerName} numberOfLines={1}>
            {other?.full_name ?? "Conversation"}
          </Text>
          <View style={s.headerMetaRow}>
            {typing || recording ? (
              <>
                {recording ? null : <TypingDots />}
                <Text style={s.headerTyping}>
                  {recording ? "recording audio…" : "typing…"}
                </Text>
              </>
            ) : (
              <Text style={s.headerMeta}>Private conversation</Text>
            )}
          </View>
        </View>
      </Pressable>
    </>
  );
});

/* ---------------------------------------------------------------- composer */

function Composer({
  api,
  conversation,
  ready,
  focused,
  meId,
  announce,
  onSubmit,
}: {
  api: NonNullable<ReturnType<typeof useSession>["api"]>;
  conversation: string;
  ready: boolean;
  focused: boolean;
  meId: string;
  announce: (kind: "text" | "audio") => void;
  onSubmit: (body: string, attachmentId: string | null) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<SelectedChatFile | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recordBusy, setRecordBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAudio, setActiveAudio] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const focusedRef = useRef(focused);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const upload = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const lastTypingSent = useRef(0);
  const recorder = useAudioRecorder(voiceRecording);
  const recording = useAudioRecorderState(recorder, 250);
  const recordingNow = useRef(false);
  const recordingTransition = useRef(false);
  const canSend = !!(text.trim() || selected);

  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recordingNow.current || recordingTransition.current) return;
    recordingTransition.current = true;
    setRecordBusy(true);
    try {
      const duration = recorder.getStatus().durationMillis / 1000;
      await recorder.stop();
      recordingNow.current = false;
      const uri = recorder.uri;
      if (uri) {
        const file = new File(uri);
        if (!file.exists || file.size < 1 || file.size > chatFileLimit)
          throw new Error(
            "The voice note could not be saved. Try a shorter recording.",
          );
        setSelected({
          uri,
          name: voiceNoteName,
          voiceDuration: duration,
          contentType: "audio/mp4",
          size: file.size,
        });
      }
    } catch {
      setError("Couldn’t finish this voice note. Please try again.");
    } finally {
      recordingNow.current = false;
      recordingTransition.current = false;
      void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      setRecordBusy(false);
    }
  }, [recorder]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") void stopRecording();
    });
    return () => {
      sub.remove();
      if (recordingNow.current) void recorder.stop().catch(() => {});
    };
  }, [recorder, stopRecording]);

  useEffect(() => {
    if (recording.isRecording && recording.durationMillis >= voiceNoteLimitMs) {
      // A synchronous stop would set state while the effect body runs; defer
      // one tick so the limit enforcement stays inside a timer callback.
      const stop = setTimeout(() => void stopRecording(), 0);
      return () => clearTimeout(stop);
    }
    return undefined;
  }, [recording.durationMillis, recording.isRecording, stopRecording]);

  async function startRecording() {
    if (recordBusy || fileBusy || recordingTransition.current) return;
    setError(null);
    setRecordBusy(true);
    recordingTransition.current = true;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          "Allow microphone access in device settings to record a voice note.",
        );
      if (AppState.currentState !== "active" || !focusedRef.current) return;
      setActiveAudio(null);
      announce("audio");
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      if (AppState.currentState !== "active" || !focusedRef.current) {
        await recorder.stop();
        return;
      }
      Keyboard.dismiss();
      setEmojiOpen(false);
      recorder.record();
      recordingNow.current = true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn’t start recording.",
      );
    } finally {
      if (!recordingNow.current)
        void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      setRecordBusy(false);
      recordingTransition.current = false;
    }
  }

  async function pickFile() {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const chosen = result.assets[0]!;
      const file = new File(chosen.uri);
      if (!file.exists || file.size < 1 || file.size > chatFileLimit)
        throw new Error("Choose a file up to 20 MB.");
      setSelected({
        uri: chosen.uri,
        name: chosen.name.slice(0, 180),
        contentType: chatFileType(chosen.name, chosen.mimeType),
        size: file.size,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn’t open this file.",
      );
    }
  }

  function onChangeText(value: string) {
    setText(value);
    if (!value.trim()) {
      lastTypingSent.current = 0;
      return;
    }
    const now = Date.now();
    if (shouldSendTyping(lastTypingSent.current, now)) {
      lastTypingSent.current = now;
      announce("text");
    }
  }

  async function submit() {
    if (submitting.current || upload.current || !focusedRef.current) return;
    if (fileBusy || recording.isRecording || recordBusy || !canSend) return;
    submitting.current = true;
    try {
      const body =
        text.trim() ||
        (selected?.voiceDuration !== undefined ? "Voice note" : selected!.name);
      setError(null);
      let attachment: string | null = null;
      if (selected) {
        setFileBusy(true);
        setProgress(0);
        const controller = new AbortController();
        upload.current = controller;
        try {
          attachment = await uploadChatFile(
            api,
            conversation,
            selected,
            controller.signal,
            setProgress,
          );
        } catch (cause) {
          setError(
            controller.signal.aborted
              ? "File sending paused. Keep this screen open and try again."
              : cause instanceof Error
                ? cause.message
                : "Couldn’t send this file.",
          );
          return;
        } finally {
          setFileBusy(false);
          upload.current = null;
        }
      }
      lastTypingSent.current = 0;
      setText("");
      setActiveAudio(null);
      setSelected(null);
      setEmojiOpen(false);
      await onSubmit(body, attachment);
    } finally {
      submitting.current = false;
    }
  }

  return (
    <View style={[s.composer, { paddingBottom: keyboardVisible ? 8 : 14 }]}>
      <Notice message={error} />
      {selected ? (
        <View style={s.file}>
          {selected.voiceDuration !== undefined ? (
            <AudioClip
              url={selected.uri}
              title="Voice note preview"
              durationHint={selected.voiceDuration}
              active={activeAudio === "preview"}
              activate={() => setActiveAudio("preview")}
              color={colors.bone}
            />
          ) : (
            <Text style={s.fileName} numberOfLines={1}>
              {selected.name}
            </Text>
          )}
          {fileBusy ? (
            <Text style={s.uploadProgress}>Uploading · {progress}%</Text>
          ) : null}
          <Button
            title={
              fileBusy
                ? "Cancel upload"
                : selected.voiceDuration !== undefined
                  ? "Discard voice note"
                  : "Remove file"
            }
            variant="ghost"
            onPress={() => {
              if (fileBusy) upload.current?.abort();
              else {
                setActiveAudio(null);
                setSelected(null);
              }
            }}
          />
        </View>
      ) : null}
      {emojiOpen ? (
        <View style={s.toolbar}>
          {emojis.map((emoji) => (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={`Insert ${emoji}`}
              style={s.emoji}
              onPress={() => {
                onChangeText((text + emoji).slice(0, 5000));
                input.current?.focus();
              }}
            >
              <Text style={{ fontSize: 25 }}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={s.composerRow}>
        {recording.isRecording ? (
          <View style={s.recording}>
            <View style={s.recordDot} />
            <Text style={s.recordLabel}>Recording</Text>
            <Text style={s.recordTime}>
              {voiceNoteTime(recording.durationMillis / 1000)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop voice note"
              onPress={() => void stopRecording()}
              style={s.recordStop}
            >
              <IconStop color={colors.void} size={16} />
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Attach a file or image"
              disabled={!ready || fileBusy || recordBusy}
              style={s.composerIcon}
              onPress={() => void pickFile()}
            >
              <IconPlus size={20} color={colors.chead} />
            </Pressable>
            <View style={s.field}>
              <TextInput
                ref={input}
                accessibilityLabel="Message"
                multiline
                maxLength={5000}
                value={text}
                onChangeText={onChangeText}
                editable={ready && !fileBusy}
                placeholder="Message"
                placeholderTextColor={colors.faint}
                style={s.input}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose emoji"
                accessibilityState={{ expanded: emojiOpen }}
                disabled={!ready || fileBusy}
                style={s.composerIcon}
                onPress={() => setEmojiOpen((value) => !value)}
              >
                <IconSmile size={20} color={colors.chead} />
              </Pressable>
            </View>
          </>
        )}
        {canSend && !recording.isRecording ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={!ready || fileBusy || recordBusy}
            onPress={() => void submit()}
            style={({ pressed }) => [
              s.send,
              pressed && { transform: [{ scale: 0.92 }] },
              ready && !fileBusy && { backgroundColor: colors.ember },
            ]}
          >
            <IconSend size={19} color={colors.white} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              recording.isRecording ? "Stop voice note" : "Record voice note"
            }
            disabled={!ready || fileBusy || recordBusy}
            style={({ pressed }) => [
              s.composerIcon,
              pressed && { transform: [{ scale: 0.94 }] },
              recording.isRecording && { backgroundColor: colors.ember },
            ]}
            onPress={() => {
              haptic("light");
              void (recording.isRecording
                ? stopRecording()
                : startRecording());
            }}
          >
            {recording.isRecording ? (
              <IconStop color={colors.white} />
            ) : (
              <IconMic color={colors.chead} />
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ thread */

function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, me } = useSession();
  const meId = me!.id;
  const { markConversationRead } = useChatActivityActions();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Local[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [olderBusy, setOlderBusy] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [other, setOther] = useState<Peer | null>(null);
  const [peerReadAt, setPeerReadAt] = useState("");
  const [atLatest, setAtLatest] = useState(true);
  const [typing, setTyping] = useState(false);
  const [peerRecording, setPeerRecording] = useState(false);
  const [pendingWhileAway, setPendingWhileAway] = useState(0);
  const [focusedState, setFocusedState] = useState(true);
  const newestFirst = useMemo(() => [...messages].reverse(), [messages]);
  const list = useRef<FlatList<Local>>(null);
  const nearBottom = useRef(true);
  const awayRef = useRef(false);
  const readAt = useRef("");
  const watermark = useRef<Message | null>(null);
  const catchingUp = useRef(false);
  const sending = useRef(new Set<string>());
  const current = useRef(true);
  const focused = useRef(true);
  const peerId = useRef<string | null>(null);
  const messagesRef = useRef<Local[]>([]);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const announceRef = useRef<(kind: "text" | "audio") => void>(() => {});

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const markRead = useCallback(
    (rows: Message[]) => {
      if (
        !focused.current ||
        AppState.currentState !== "active" ||
        !nearBottom.current
      )
        return;
      const last = rows.filter((row) => !("delivery" in row)).at(-1);
      if (!last || readAt.current >= last.created_at) return;
      readAt.current = last.created_at;
      // The provider applies the receipt locally and persists it; realtime
      // reconciles the database value, so the badge can never flicker back on.
      markConversationRead(id, last.created_at);
    },
    [id, markConversationRead],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      uuidSchema.parse(id);
      const membership = await api!.supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", id)
        .eq("user_id", meId)
        .maybeSingle();
      if (membership.error || !membership.data)
        throw new Error("Conversation unavailable.");
      const [peers, reply] = await Promise.all([
        api!.supabase
          .from("conversation_participants")
          .select("user_id,last_read_at")
          .eq("conversation_id", id)
          .neq("user_id", meId)
          .limit(1),
        api!.supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", id)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(51),
      ]);
      if (reply.error)
        throw new Error("Couldn’t load this conversation. Try again.");
      if (!current.current) return;
      const rows = reply.data.slice(0, 50).reverse();
      setMessages((previous) => mergeChatMessages(previous, rows));
      watermark.current = rows.at(-1) ?? null;
      readAt.current = "";
      markRead(rows);
      setHasOlder(reply.data.length > 50);
      setReady(true);
      const participant = peers.data?.[0];
      if (participant) {
        peerId.current = participant.user_id;
        setPeerReadAt((previous) =>
          previous > participant.last_read_at
            ? previous
            : participant.last_read_at,
        );
        const peer = await api!.supabase
          .from("profiles")
          .select("id,full_name,handle,profile_pic_key")
          .eq("id", participant.user_id)
          .maybeSingle();
        if (current.current && !peer.error) setOther(peer.data);
      }
    } catch (cause) {
      if (current.current)
        setError(
          cause instanceof Error ? cause.message : "Couldn’t load messages.",
        );
    }
  }, [api, id, meId, markRead]);

  const catchUp = useCallback(async () => {
    if (!ready || catchingUp.current || AppState.currentState !== "active")
      return;
    catchingUp.current = true;
    try {
      const receipt = await api!.supabase
        .from("conversation_participants")
        .select("last_read_at")
        .eq("conversation_id", id)
        .neq("user_id", meId)
        .maybeSingle();
      const seen = receipt.data?.last_read_at;
      if (current.current && seen)
        setPeerReadAt((previous) => (previous > seen ? previous : seen));
      for (let page = 0; page < 20 && current.current; page++) {
        let query = api!.supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", id)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(100);
        if (watermark.current)
          query = query.or(chatCursorAfter(watermark.current));
        const reply = await query;
        if (reply.error) break; // A temporary reconnect must not replace history.
        if (!current.current) return;
        const rows = reply.data;
        setMessages((previous) => mergeChatMessages(previous, rows));
        if (rows.length) watermark.current = rows.at(-1)!;
        markRead(rows);
        if (rows.length < 100) break;
      }
    } catch {
      // Native connectivity changes can reject a request before it responds.
    } finally {
      catchingUp.current = false;
    }
  }, [api, id, meId, ready, markRead]);

  useEffect(() => {
    current.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      current.current = false;
    };
  }, [load]);

  // Live delivery: new messages, peer read receipts and the ephemeral typing
  // broadcast arrive on dedicated channels; each event applies directly.
  useEffect(() => {
    if (!ready) return;
    const supabase = api!.supabase;
    const channel = supabase
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
          const row = payload.new as Message;
          setMessages((previous) => mergeChatMessages(previous, [row]));
          if (row.sender_id === peerId.current) {
            setTyping(false);
            setPeerRecording(false);
            clearTimeout(typingTimer.current);
          }
          markRead([row]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_participants",
          filter: `conversation_id=eq.${id}`,
        },
        ({ new: participant }) => {
          if (
            participant.user_id === meId ||
            typeof participant.last_read_at !== "string"
          )
            return;
          const seen = participant.last_read_at;
          setPeerReadAt((previous) => (previous > seen ? previous : seen));
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void catchUp();
      });
    const presence = supabase
      .channel(typingChannel(id), {
        config: { broadcast: { self: false } },
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.user !== peerId.current) return;
        if (payload.kind === "audio") setPeerRecording(true);
        else setTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => {
          setTyping(false);
          setPeerRecording(false);
        }, typingExpiryMs);
      })
      .subscribe();
    announceRef.current = (kind) => {
      presence.send({
        type: "broadcast",
        event: "typing",
        payload: { user: meId, kind },
      });
    };
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") void catchUp();
    });
    const timer = setInterval(() => void catchUp(), 15000);
    return () => {
      foreground.remove();
      clearInterval(timer);
      clearTimeout(typingTimer.current);
      announceRef.current = () => {};
      void supabase.removeChannel(channel);
      void supabase.removeChannel(presence);
    };
  }, [api, id, meId, ready, catchUp, markRead]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setFocusedState(true);
      void catchUp();
      return () => {
        focused.current = false;
        setFocusedState(false);
      };
    }, [catchUp]),
  );

  const send = useCallback(
    async (body: string, attachmentId: string | null, clientId: string) => {
      if (sending.current.has(clientId)) return;
      sending.current.add(clientId);
      nearBottom.current = true;
      setAtLatest(true);
      setPendingWhileAway(0);
      const optimistic: Local = {
        id: clientId,
        conversation_id: id,
        sender_id: meId,
        client_id: clientId,
        body,
        attachment_id: attachmentId,
        film_id: null,
        created_at: new Date().toISOString(),
        delivery: "sending",
      };
      setMessages((previous) => mergeChatMessages(previous, [optimistic]));
      try {
        const reply = await api!.chat.send({
          conversation_id: id,
          body,
          client_id: clientId,
          attachment_id: attachmentId,
        });
        let confirmed = reply.data;
        if (reply.error?.code === "23505") {
          const recovered = await api!.supabase
            .from("messages")
            .select("*")
            .eq("sender_id", meId)
            .eq("client_id", clientId)
            .eq("conversation_id", id)
            .maybeSingle();
          confirmed = recovered.data;
        }
        if (!confirmed) throw new Error("Message not sent.");
        if (current.current)
          setMessages((previous) => mergeChatMessages(previous, [confirmed!]));
      } catch {
        if (current.current)
          setMessages((previous) =>
            previous.map((row) =>
              row.sender_id === meId &&
              row.client_id === clientId &&
              row.delivery
                ? { ...row, delivery: "failed" }
                : row,
            ),
          );
      } finally {
        sending.current.delete(clientId);
      }
    },
    [api, id, meId],
  );

  const onRetry = useCallback(
    (row: Local) => {
      void send(row.body, row.attachment_id, row.client_id);
    },
    [send],
  );

  const submitFromComposer = useCallback(
    async (body: string, attachmentId: string | null) => {
      await send(body, attachmentId, Crypto.randomUUID());
    },
    [send],
  );

  async function loadOlder() {
    if (olderBusy || !watermark.current) return;
    setOlderBusy(true);
    setError(null);
    try {
      const before = watermark.current;
      const reply = await api!.supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", id)
        .or(
          `created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`,
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(51);
      if (reply.error) throw new Error("Couldn’t load older messages.");
      const rows = reply.data.slice(0, 50).reverse();
      setMessages((previous) => mergeChatMessages(previous, rows));
      if (rows.length) watermark.current = rows[0]!;
      setHasOlder(reply.data.length > 50);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn’t load older messages.",
      );
    } finally {
      setOlderBusy(false);
    }
  }

  function jumpToLatest(animated = true) {
    nearBottom.current = true;
    setAtLatest(true);
    setPendingWhileAway(0);
    list.current?.scrollToOffset({ offset: 0, animated });
    markRead(messagesRef.current);
  }

  const onScroll = useCallback(
    ({ nativeEvent }: { nativeEvent: { contentOffset: { y: number } } }) => {
      const latest = nativeEvent.contentOffset.y <= nearBottomOffset;
      if (latest !== nearBottom.current) {
        nearBottom.current = latest;
        setAtLatest(latest);
        if (latest) markRead(messagesRef.current);
      }
    },
    [markRead],
  );

  // Count arrivals while scrolled away so the jump pill carries a real number.
  useEffect(() => {
    awayRef.current = !atLatest;
  }, [atLatest]);
  const latestId = messages.at(-1)?.id;
  const latestIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (latestId && latestIdRef.current !== latestId) {
      latestIdRef.current = latestId;
      if (awayRef.current) setPendingWhileAway((count) => count + 1);
    }
  }, [latestId]);

  const [listAudio, setListAudio] = useState<string | null>(null);
  const onAudio = useCallback((value: string) => {
    setListAudio(value);
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: Local; index: number }) => {
      const mine = item.sender_id === meId;
      const above = newestFirst[index + 1];
      const below = newestFirst[index - 1];
      const date = new Date(item.created_at);
      const groupedAbove =
        !!above &&
        above.sender_id === item.sender_id &&
        !above.delivery &&
        !item.delivery &&
        date.getTime() - new Date(above.created_at).getTime() <=
          groupWindowMs &&
        date.toDateString() === new Date(above.created_at).toDateString();
      const groupedBelow =
        !!below &&
        below.sender_id === item.sender_id &&
        !below.delivery &&
        !item.delivery &&
        new Date(below.created_at).getTime() - date.getTime() <=
          groupWindowMs &&
        new Date(below.created_at).toDateString() === date.toDateString();
      const newDay =
        !above ||
        date.toDateString() !==
          new Date(above.created_at).toDateString();
      return (
        <View>
          {newDay ? <DayChip label={dayLabel(date)} /> : null}
          <MessageRow
            row={item}
            mine={mine}
            groupedAbove={groupedAbove}
            groupedBelow={groupedBelow}
            peerReadAt={peerReadAt}
            activeAudio={listAudio}
            onAudio={onAudio}
            api={api!}
            onRetry={onRetry}
          />
        </View>
      );
    },
    [meId, newestFirst, peerReadAt, listAudio, onAudio, api, onRetry],
  );

  return (
    <KeyboardAvoidingView style={s.screen} behavior="padding">
      <View style={[s.header, { paddingTop: insets.top + 6 }]}>
        <ThreadHeader
          other={other}
          typing={typing}
          recording={peerRecording}
          onBack={() =>
            router.canGoBack() ? router.back() : router.replace("/chats")
          }
          onOpenProfile={() =>
            other &&
            router.push({
              pathname: "/u/[handle]",
              params: { handle: other.handle },
            })
          }
        />
      </View>
      {!ready && !error ? <Busy /> : null}
      <FlatList
        ref={list}
        inverted={messages.length > 0}
        data={newestFirst}
        keyExtractor={(row) => `${row.sender_id}:${row.client_id}`}
        style={{ flex: 1 }}
        contentContainerStyle={s.history}
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={keepPosition}
        onScroll={onScroll}
        scrollEventThrottle={32}
        ListFooterComponent={
          hasOlder ? (
            <Button
              title={olderBusy ? "Loading…" : "Load older messages"}
              disabled={olderBusy}
              variant="ghost"
              onPress={() => void loadOlder()}
            />
          ) : undefined
        }
        ListEmptyComponent={
          ready && other ? (
            <View style={s.empty}>
              <Avatar
                picKey={other.profile_pic_key}
                name={other.full_name}
                size={76}
              />
              <Text style={s.emptyTitle}>
                This is the start of your conversation with{" "}
                {other.full_name.split(" ")[0]}
              </Text>
              <Text style={s.emptyBody}>
                Say what you liked about their work, or what you’re making.
              </Text>
            </View>
          ) : undefined
        }
        renderItem={renderItem}
      />
      {!atLatest ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Jump to latest message"
          style={s.jump}
          onPress={() => jumpToLatest()}
        >
          <IconChevronDown color={colors.bone} size={19} />
          {pendingWhileAway > 0 ? (
            <View style={s.jumpCount}>
              <Text style={s.jumpCountText}>
                {pendingWhileAway > 9 ? "9+" : pendingWhileAway}
              </Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}
      <Composer
        api={api!}
        conversation={id}
        ready={ready}
        focused={focusedState}
        meId={meId}
        announce={(kind) => announceRef.current(kind)}
        onSubmit={submitFromComposer}
      />
    </KeyboardAvoidingView>
  );
}

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Gate>
      <Thread key={id} />
    </Gate>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.void },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  headerIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    minWidth: 0,
  },
  headerName: {
    color: colors.text,
    fontFamily: fonts.extraBold,
    fontSize: 16.5,
    letterSpacing: -0.3,
  },
  headerMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerMeta: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  headerTyping: {
    color: colors.pink,
    fontFamily: fonts.semibold,
    fontSize: 12,
  },
  typingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  typingDot: { width: 5, height: 5, borderRadius: 2.5 },
  history: { paddingHorizontal: 14, paddingVertical: 10 },
  message: {},
  messageFirst: { marginTop: 6 },
  messageGrouped: { marginTop: 2 },
  bubble: {
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 7,
    gap: 4,
    maxWidth: "86%",
  },
  theirs: {
    backgroundColor: colors.graphite,
    alignSelf: "flex-start",
    borderBottomLeftRadius: 6,
  },
  mine: {
    backgroundColor: colors.bone,
    alignSelf: "flex-end",
    borderBottomRightRadius: 6,
  },
  theirsContinuedTop: { borderTopRightRadius: 8 },
  mineContinuedTop: { borderTopLeftRadius: 8 },
  theirsContinuedBottom: { borderBottomLeftRadius: 8 },
  mineContinuedBottom: { borderBottomRightRadius: 8 },
  text: { color: colors.bone, fontSize: 15.5, lineHeight: 21 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 1,
    alignSelf: "stretch",
  },
  time: { fontSize: 10, fontFamily: fonts.regular },
  retry: { minHeight: 30, justifyContent: "center" },
  dayChip: {
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.graphiteRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  dayText: {
    color: colors.muted,
    fontFamily: fonts.medium,
    fontSize: 10.5,
    letterSpacing: 0.3,
  },
  jump: {
    position: "absolute",
    right: 18,
    bottom: 86,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.graphiteRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
  jumpCount: {
    position: "absolute",
    top: -4,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.ember,
    alignItems: "center",
    justifyContent: "center",
  },
  jumpCountText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  empty: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 30,
    transform: [{ scaleY: -1 }],
  },
  emptyTitle: {
    color: colors.bone,
    fontFamily: fonts.extraBold,
    fontSize: 17,
    textAlign: "center",
    lineHeight: 24,
  },
  emptyBody: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },
  composer: {
    paddingHorizontal: 10,
    paddingTop: 8,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.void,
  },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 7 },
  composerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.graphite,
  },
  field: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.graphite,
    borderRadius: 22,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 21,
    backgroundColor: colors.graphite,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 20,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.graphiteRaised,
  },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  emoji: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  file: {
    gap: 4,
    padding: 8,
    borderRadius: 14,
    backgroundColor: colors.graphite,
  },
  fileName: {
    color: colors.chead,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  uploadProgress: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  recording: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: colors.graphite,
  },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.pink,
  },
  recordLabel: { color: colors.bone, fontFamily: fonts.regular, fontSize: 14 },
  recordTime: {
    color: colors.bone,
    fontFamily: fonts.mono,
    marginLeft: "auto",
  },
  recordStop: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.ember,
    alignItems: "center",
    justifyContent: "center",
  },
});
