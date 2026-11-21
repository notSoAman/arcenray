import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import {
  AppState,
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
import {
  IconChevronDown,
  IconChevronLeft,
  IconMic,
  IconPlus,
  IconSend,
  IconStop,
  IconSmile,
} from "../../src/icons";
import { Button, Muted, Notice, Busy, Nav, IconButton } from "../../src/ui";
import { colors, fonts } from "../../src/theme";
import {
  mergeChatMessages,
  chatCursorAfter,
  chatFileLimit,
  chatFileType,
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

type Message = Database["public"]["Tables"]["messages"]["Row"];
type Local = Message & { delivery?: "sending" | "failed" };
const voiceRecording = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64_000,
};
const keepPosition = { minIndexForVisible: 0, autoscrollToTopThreshold: 44 };
const emojis = ["😊", "❤️", "👏", "🔥", "🎬", "🙏", "👍", "✨"];

function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, me } = useSession();
  const meId = me!.id;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Local[]>([]);
  const [text, setText] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [olderBusy, setOlderBusy] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [selected, setSelected] = useState<SelectedChatFile | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [activeAudio, setActiveAudio] = useState<string | null>(null);
  const [other, setOther] = useState<{
    id: string;
    full_name: string;
    handle: string;
    profile_pic_key: string | null;
  } | null>(null);
  const [peerReadAt, setPeerReadAt] = useState("");
  const [atLatest, setAtLatest] = useState(true);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const newestFirst = useMemo(() => [...messages].reverse(), [messages]);
  const latestSent = messages.findLast(
    (row) =>
      row.sender_id === meId && !row.delivery && row.created_at <= peerReadAt,
  )?.id;
  const canSend = !!(text.trim() || selected);
  const [recordBusy, setRecordBusy] = useState(false);
  const list = useRef<FlatList<Local>>(null);
  const nearBottom = useRef(true);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const readAt = useRef("");
  const watermark = useRef<Message | null>(null);
  const catchingUp = useRef(false);
  const sending = useRef(new Set<string>());
  const upload = useRef<AbortController | null>(null);
  const current = useRef(true);
  const focused = useRef(true);
  const submitting = useRef(false);
  const oldest = useRef<Message | null>(null);
  const recorder = useAudioRecorder(voiceRecording);
  const recording = useAudioRecorderState(recorder, 250);
  const recordingNow = useRef(false);
  const recordingTransition = useRef(false);

  const markRead = useCallback(
    async (rows: Message[]) => {
      if (
        !focused.current ||
        AppState.currentState !== "active" ||
        !nearBottom.current
      )
        return;
      const last = rows.filter((row) => !("delivery" in row)).at(-1);
      if (!last || readAt.current >= last.created_at) return;
      try {
        const result = await api!.supabase
          .from("conversation_participants")
          .update({ last_read_at: last.created_at })
          .eq("conversation_id", id)
          .eq("user_id", meId)
          .lt("last_read_at", last.created_at);
        if (!result.error && readAt.current < last.created_at)
          readAt.current = last.created_at;
      } catch {
        /* Reconnect will retry the read receipt. */
      }
    },
    [api, id, meId],
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
      oldest.current = rows[0] ?? null;
      setHasOlder(reply.data.length > 50);
      setReady(true);
      void markRead(rows);
      const participant = peers.data?.[0];
      if (participant) {
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
        if (reply.error) break; // A temporary reconnect must not replace message history with an error.
        if (!current.current) return;
        const rows = reply.data;
        setMessages((previous) => mergeChatMessages(previous, rows));
        if (rows.length) watermark.current = rows.at(-1)!;
        void markRead(rows);
        if (rows.length < 100) break;
      }
    } catch {
      // Native connectivity changes can reject a request before it gets a response.
    } finally {
      catchingUp.current = false;
    }
  }, [api, id, meId, ready, markRead]);

  useEffect(() => {
    current.current = true;
    // Initial fetch synchronizes this conversation with the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      current.current = false;
      upload.current?.abort();
    };
  }, [load]);
  useEffect(() => {
    if (!ready) return;
    const channel = api!.supabase
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
          void markRead([row]);
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
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") void catchUp();
      else upload.current?.abort();
    });
    const timer = setInterval(() => void catchUp(), 15000);
    return () => {
      foreground.remove();
      clearInterval(timer);
      void api!.supabase.removeChannel(channel);
    };
  }, [api, id, meId, ready, catchUp, markRead]);
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
      if (uri && current.current) {
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
      if (current.current)
        setError("Couldn’t finish this voice note. Please try again.");
    } finally {
      recordingNow.current = false;
      recordingTransition.current = false;
      void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      if (current.current) setRecordBusy(false);
    }
  }, [recorder]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void catchUp();
      return () => {
        focused.current = false;
        upload.current?.abort();
        setActiveAudio(null);
        void stopRecording();
      };
    }, [catchUp, stopRecording]),
  );

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
    if (recording.isRecording && recording.durationMillis >= voiceNoteLimitMs)
      // Recorder duration is an external native event; enforce the recording limit.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void stopRecording();
  }, [recording.durationMillis, recording.isRecording, stopRecording]);

  async function startRecording() {
    if (recordBusy || fileBusy || recordingTransition.current) return;
    setError(null);
    setRecordBusy(true);
    recordingTransition.current = true;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (
        !current.current ||
        !focused.current ||
        AppState.currentState !== "active"
      )
        return;
      if (!permission.granted)
        throw new Error(
          "Allow microphone access in device settings to record a voice note.",
        );
      setActiveAudio(null);
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      if (
        !current.current ||
        !focused.current ||
        AppState.currentState !== "active"
      ) {
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
      if (current.current) setRecordBusy(false);
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
      if (result.canceled || !current.current || !focused.current) return;
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
  async function send(
    body: string,
    attachmentId: string | null,
    clientId = Crypto.randomUUID(),
  ) {
    if (sending.current.has(clientId)) return;
    sending.current.add(clientId);
    jumpToLatest(false);
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
            row.sender_id === meId && row.client_id === clientId && row.delivery
              ? { ...row, delivery: "failed" }
              : row,
          ),
        );
    } finally {
      sending.current.delete(clientId);
    }
  }
  async function submit() {
    if (submitting.current || upload.current || !focused.current) return;
    if (
      fileBusy ||
      recording.isRecording ||
      recordBusy ||
      (!text.trim() && !selected)
    )
      return;
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
            api!,
            id,
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
      setText("");
      setActiveAudio(null);
      setSelected(null);
      setEmojiOpen(false);
      if (!current.current || !focused.current) return;
      await send(body, attachment);
    } finally {
      submitting.current = false;
    }
  }
  async function loadOlder() {
    if (olderBusy || !oldest.current) return;
    setOlderBusy(true);
    setError(null);
    try {
      const before = oldest.current;
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
      if (rows.length) oldest.current = rows[0]!;
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
    list.current?.scrollToOffset({ offset: 0, animated });
    void markRead(messages);
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior="padding">
      <View style={[s.header, { paddingTop: insets.top + 6 }]}>
        <IconButton
          label="Back to chats"
          glass={false}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/chats")
          }
          icon={<IconChevronLeft size={22} color={colors.bone} />}
        />
        <Pressable
          accessibilityRole="link"
          disabled={!other}
          onPress={() =>
            other &&
            router.push({
              pathname: "/u/[handle]",
              params: { handle: other.handle },
            })
          }
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 11,
          }}
        >
          {other ? (
            <Avatar
              picKey={other.profile_pic_key}
              name={other.full_name}
              size={38}
            />
          ) : null}
          <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={s.headerName}>
              {other?.full_name ?? "Conversation"}
            </Text>
            <Text style={s.headerMeta}>
              {ready ? "Private conversation" : "Connecting…"}
            </Text>
          </View>
        </Pressable>
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
        onScroll={(event) => {
          const latest = event.nativeEvent.contentOffset.y <= 44;
          if (latest !== nearBottom.current) {
            nearBottom.current = latest;
            setAtLatest(latest);
            if (latest) void markRead(messages);
          }
        }}
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
          ready ? <Muted>Start your conversation.</Muted> : undefined
        }
        renderItem={({ item: row, index }) => {
          const mine = row.sender_id === meId;
          const date = new Date(row.created_at);
          const previous = newestFirst[index + 1];
          const newDay =
            !previous ||
            date.toDateString() !==
              new Date(previous.created_at).toDateString();
          const ink = mine ? colors.void : colors.bone;
          return (
            <View style={s.message}>
              {newDay ? (
                <Text style={s.date}>
                  {date.toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
              ) : null}
              <View style={[s.bubble, mine && s.mine]}>
                {row.attachment_id ? (
                  <ChatAttachment
                    id={row.attachment_id}
                    body={row.body}
                    mine={mine}
                    api={api!}
                    activeAudio={activeAudio}
                    onAudio={setActiveAudio}
                  />
                ) : (
                  <Text style={[s.text, { color: ink }]} selectable>
                    {row.body}
                  </Text>
                )}
                {row.film_id ? (
                  <Nav
                    title="View attached film"
                    href={{
                      pathname: "/film/[id]",
                      params: { id: row.film_id },
                    }}
                  />
                ) : null}
                <Text
                  style={[s.time, mine && { color: "rgba(14,15,14,0.65)" }]}
                >
                  {date.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {row.delivery === "sending" ? " · Sending…" : ""}
                  {row.id === latestSent ? " · Seen" : ""}
                </Text>
                {row.delivery === "failed" ? (
                  <Pressable
                    accessibilityRole="button"
                    style={s.retry}
                    onPress={() =>
                      void send(row.body, row.attachment_id, row.client_id)
                    }
                  >
                    <Text style={{ color: ink, fontFamily: fonts.semibold }}>
                      Couldn’t send · Retry
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        }}
      />
      {!atLatest ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Jump to latest message"
          style={s.jump}
          onPress={() => jumpToLatest()}
        >
          <IconChevronDown color={colors.bone} size={19} />
        </Pressable>
      ) : null}
      <View
        style={[
          s.composer,
          { paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 12) },
        ]}
      >
        <Notice
          message={error}
          retry={!ready ? () => void load() : undefined}
        />
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
              <Muted>{selected.name}</Muted>
            )}
            {fileBusy ? <Muted>Uploading · {progress}%</Muted> : null}
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
                  setText((value) => (value + emoji).slice(0, 5000));
                  setEmojiOpen(false);
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
              <Text style={s.text}>Recording</Text>
              <Text style={s.recordTime}>
                {voiceNoteTime(recording.durationMillis / 1000)}
              </Text>
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
                <IconPlus size={19} color={colors.chead} />
              </Pressable>
              <View style={s.field}>
                <TextInput
                  ref={input}
                  accessibilityLabel="Message"
                  multiline
                  maxLength={5000}
                  value={text}
                  onChangeText={setText}
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
                  <IconSmile size={19} color={colors.chead} />
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
              style={[
                s.send,
                ready && !fileBusy && { backgroundColor: colors.ember },
              ]}
            >
              <IconSend size={18} color={colors.white} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                recording.isRecording ? "Stop voice note" : "Record voice note"
              }
              disabled={!ready || fileBusy || recordBusy}
              style={[
                s.composerIcon,
                recording.isRecording && { backgroundColor: colors.ember },
              ]}
              onPress={() =>
                void (recording.isRecording
                  ? stopRecording()
                  : startRecording())
              }
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
    gap: 6,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(243,239,233,0.06)",
  },
  headerName: {
    color: colors.text,
    fontFamily: "InterTight_800ExtraBold",
    fontSize: 17,
  },
  headerMeta: {
    color: colors.muted,
    fontFamily: "InterTight_400Regular",
    fontSize: 12,
  },
  history: { paddingHorizontal: 16, paddingVertical: 8 },
  message: { gap: 8, paddingVertical: 4 },
  date: {
    color: colors.muted,
    alignSelf: "center",
    fontFamily: fonts.medium,
    fontSize: 11,
    marginVertical: 6,
  },
  retry: { minHeight: 36, justifyContent: "center" },
  jump: {
    alignSelf: "flex-end",
    marginRight: 16,
    marginBottom: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.graphiteRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  recording: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    gap: 8,
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
  recordTime: {
    color: colors.bone,
    fontFamily: fonts.mono,
    marginLeft: "auto",
  },
  bubble: {
    backgroundColor: colors.graphite,
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 15,
    paddingVertical: 11,
    gap: 7,
    alignSelf: "flex-start",
    maxWidth: "86%",
  },
  mine: {
    alignSelf: "flex-end",
    backgroundColor: colors.bone,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 6,
  },
  text: { color: colors.bone, fontSize: 15, lineHeight: 21 },
  time: { color: colors.muted, fontSize: 10 },
  composer: {
    paddingHorizontal: 10,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(243,239,233,0.06)",
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
    fontFamily: "InterTight_400Regular",
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
    borderRadius: 12,
    backgroundColor: colors.graphite,
  },
});
