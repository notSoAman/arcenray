import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
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
import { Button, Field, Muted, Notice, Busy, Nav } from "../../src/ui";
import { colors } from "../../src/theme";
import {
  mergeChatMessages,
  chatCursorAfter,
  chatFileLimit,
  chatFileType,
} from "../../src/chat-state";
import {
  ChatAttachment,
  uploadChatFile,
  type SelectedChatFile,
} from "../../src/chat-attachment";

type Message = Database["public"]["Tables"]["messages"]["Row"];
type Local = Message & { delivery?: "sending" | "failed" };
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
  const [live, setLive] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [selected, setSelected] = useState<SelectedChatFile | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [activeAudio, setActiveAudio] = useState<string | null>(null);
  const [recordBusy, setRecordBusy] = useState(false);
  const list = useRef<FlatList<Local>>(null);
  const nearBottom = useRef(true);
  const readAt = useRef("");
  const watermark = useRef<Message | null>(null);
  const catchingUp = useRef(false);
  const sending = useRef(new Set<string>());
  const upload = useRef<AbortController | null>(null);
  const current = useRef(true);
  const focused = useRef(true);
  const submitting = useRef(false);
  const oldest = useRef<Message | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
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
          .eq("user_id", meId);
        if (!result.error) readAt.current = last.created_at;
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
      const reply = await api!.supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(51);
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
  }, [api, id, ready, markRead]);

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
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
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
  }, [api, id, ready, catchUp, markRead]);

  const stopRecording = useCallback(async () => {
    if (!recordingNow.current || recordingTransition.current) return;
    recordingTransition.current = true;
    setRecordBusy(true);
    try {
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
          name: `Voice note ${new Date().toISOString().replace(/[:.]/g, "-")}.m4a`,
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
    if (recording.isRecording && recording.durationMillis >= 120000)
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
    nearBottom.current = true;
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
      const body = text.trim() || selected!.name;
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
    nearBottom.current = false;
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
  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to chats"
          onPress={() => router.back()}
          style={s.smallButton}
        >
          <Text style={s.text}>‹ Chats</Text>
        </Pressable>
        <Muted>{live ? "Private conversation" : "Connecting…"}</Muted>
      </View>
      {!ready && !error ? <Busy /> : null}
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(row) => `${row.sender_id}:${row.client_id}`}
        style={{ flex: 1 }}
        contentContainerStyle={s.history}
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onScroll={(event) => {
          const { contentOffset, layoutMeasurement, contentSize } =
            event.nativeEvent;
          nearBottom.current =
            contentOffset.y + layoutMeasurement.height >=
            contentSize.height - 120;
          if (nearBottom.current) void markRead(messages);
        }}
        scrollEventThrottle={150}
        onContentSizeChange={() => {
          if (nearBottom.current)
            list.current?.scrollToEnd({ animated: false });
        }}
        ListHeaderComponent={
          hasOlder ? (
            <Button
              title={olderBusy ? "Loading…" : "Load older messages"}
              disabled={olderBusy}
              secondary
              onPress={() => void loadOlder()}
            />
          ) : undefined
        }
        ListEmptyComponent={
          ready ? <Muted>Start your conversation.</Muted> : undefined
        }
        renderItem={({ item: row }) => (
          <View style={[s.bubble, row.sender_id === meId && s.mine]}>
            <Text style={s.text} selectable>
              {row.body}
            </Text>
            {row.attachment_id ? (
              <ChatAttachment
                id={row.attachment_id}
                api={api!}
                activeAudio={activeAudio}
                onAudio={setActiveAudio}
              />
            ) : null}
            {row.film_id ? (
              <Nav
                title="View attached film"
                href={{ pathname: "/film/[id]", params: { id: row.film_id } }}
              />
            ) : null}
            <Text style={s.time}>
              {new Date(row.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {row.delivery === "sending" ? " · Sending…" : ""}
            </Text>
            {row.delivery === "failed" ? (
              <Button
                title="Not sent · Retry"
                secondary
                onPress={() =>
                  void send(row.body, row.attachment_id, row.client_id)
                }
              />
            ) : null}
          </View>
        )}
      />
      <View
        style={[s.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        <Notice
          message={error}
          retry={!ready ? () => void load() : undefined}
        />
        {selected ? (
          <View style={s.file}>
            <Muted>
              {selected.name}
              {fileBusy ? ` · ${progress}%` : ""}
            </Muted>
            <Button
              title={fileBusy ? "Cancel upload" : "Remove file"}
              secondary
              onPress={() =>
                fileBusy ? upload.current?.abort() : setSelected(null)
              }
            />
          </View>
        ) : null}
        {recording.isRecording ? (
          <Muted>
            Recording · {Math.floor(recording.durationMillis / 1000)}s / 120s
          </Muted>
        ) : null}
        {emojiOpen ? (
          <View style={s.toolbar}>
            {emojis.map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={`Insert ${emoji}`}
                style={s.emoji}
                onPress={() =>
                  setText((value) => (value + emoji).slice(0, 5000))
                }
              >
                <Text style={{ fontSize: 25 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Field
          label="Message"
          multiline
          maxLength={5000}
          value={text}
          onChangeText={setText}
          editable={ready && !fileBusy && !recording.isRecording}
          style={{ maxHeight: 120 }}
        />
        <View style={s.toolbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Attach a file or image"
            disabled={!ready || fileBusy || recordBusy || recording.isRecording}
            style={s.smallButton}
            onPress={() => void pickFile()}
          >
            <Text style={s.text}>Attach</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose emoji"
            disabled={!ready || fileBusy}
            style={s.smallButton}
            onPress={() => setEmojiOpen((value) => !value)}
          >
            <Text style={s.text}>😊</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              recording.isRecording ? "Stop voice note" : "Record voice note"
            }
            disabled={
              !ready ||
              fileBusy ||
              recordBusy ||
              (!!selected && !recording.isRecording)
            }
            style={s.smallButton}
            onPress={() =>
              void (recording.isRecording ? stopRecording() : startRecording())
            }
          >
            <Text style={s.text}>
              {recording.isRecording ? "Stop" : "Voice note"}
            </Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Button
              title={fileBusy ? "Sending file…" : "Send"}
              disabled={
                !ready ||
                fileBusy ||
                recording.isRecording ||
                recordBusy ||
                (!text.trim() && !selected)
              }
              onPress={() => void submit()}
            />
          </View>
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
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  history: { padding: 16, gap: 12 },
  bubble: {
    backgroundColor: colors.graphite,
    borderRadius: 18,
    padding: 14,
    gap: 8,
    alignSelf: "flex-start",
    maxWidth: "90%",
  },
  mine: { alignSelf: "flex-end", borderWidth: 1, borderColor: colors.pink },
  text: { color: colors.bone, fontSize: 16 },
  time: { color: colors.muted, fontSize: 11 },
  composer: {
    paddingHorizontal: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.graphite,
  },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  smallButton: {
    minHeight: 44,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
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
