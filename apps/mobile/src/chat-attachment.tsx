import { useEffect, useRef, useState } from "react";
import {
  AppState,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { File, Paths, UploadType } from "expo-file-system";
import type { Api } from "./session";
import { colors, fonts } from "./theme";
import { IconPause, IconPlay } from "./icons";
import { randomUUID } from "expo-crypto";
import { chatFileLimit, isVoiceNote, voiceNoteTime } from "./chat-state";

export type SelectedChatFile = {
  uri: string;
  name: string;
  contentType: string;
  size: number;
  assetId?: string;
  uploaded?: boolean;
  voiceDuration?: number;
};
export function privateMediaUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".r2.cloudflarestorage.com") ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  )
    throw new Error("The file link is unavailable. Please try again.");
  return url.toString();
}
export async function uploadChatFile(
  api: Api,
  conversation: string,
  selected: SelectedChatFile,
  signal: AbortSignal,
  progress: (percent: number) => void,
) {
  const file = new File(selected.uri);
  if (
    !file.exists ||
    file.size < 1 ||
    file.size > chatFileLimit ||
    file.size !== selected.size
  )
    throw new Error(
      "Choose a file up to 20 MB that is still available on this device.",
    );
  if (!selected.uploaded) {
    const create = await api.chat.attachment.create({
      conversation_id: conversation,
      name: selected.name,
      content_type: selected.contentType,
      bytes: file.size,
    });
    if (create.error || !create.data)
      throw new Error("Couldn’t start sending this file. Try again.");
    selected.assetId = create.data.asset_id;
    const response = await file.upload(
      privateMediaUrl(create.data.upload_url),
      {
        httpMethod: "PUT",
        uploadType: UploadType.BINARY_CONTENT,
        headers: create.data.headers,
        signal,
        onProgress: ({ bytesSent }) =>
          progress(Math.min(99, Math.round((100 * bytesSent) / file.size))),
      },
    );
    if (response.status < 200 || response.status >= 300)
      throw new Error("The file didn’t finish uploading. Try again.");
    selected.uploaded = true;
  }
  signal.throwIfAborted();
  const complete = await api.chat.attachment.complete(selected.assetId!);
  if (complete.error || !complete.data)
    throw new Error(
      "Your file uploaded, but couldn’t be confirmed yet. Try again.",
    );
  progress(100);
  return complete.data.asset_id;
}

export function AudioClip({
  url,
  title,
  active,
  activate,
  color,
  durationHint = 0,
  autoplay = false,
}: {
  url: string;
  title: string;
  active: boolean;
  activate: () => void;
  color: string;
  durationHint?: number;
  autoplay?: boolean;
}) {
  const player = useAudioPlayer(url, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const initialPlay = useRef(autoplay);
  const [trackWidth, setTrackWidth] = useState(0);
  const [seekFailed, setSeekFailed] = useState(false);
  const duration = status.duration || durationHint;
  const current = Math.min(status.currentTime || 0, duration);
  const progress = duration > 0 ? current / duration : 0;

  useEffect(() => {
    if (!active) {
      initialPlay.current = false;
      player.pause();
    } else if (
      status.isLoaded &&
      initialPlay.current &&
      AppState.currentState === "active"
    ) {
      initialPlay.current = false;
      player.play();
    }
  }, [active, player, status.isLoaded]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        initialPlay.current = false;
        player.pause();
      }
    });
    return () => sub.remove();
  }, [player]);

  async function togglePlayback() {
    setSeekFailed(false);
    if (status.playing) {
      player.pause();
      return;
    }
    activate();
    try {
      if (status.didJustFinish || (duration > 0 && current >= duration))
        await player.seekTo(0);
      player.play();
    } catch {
      setSeekFailed(true);
    }
  }

  function seek(seconds: number) {
    setSeekFailed(false);
    void player.seekTo(Math.max(0, Math.min(seconds, duration))).catch(() => {
      setSeekFailed(true);
    });
  }

  return (
    <View style={styles.audio}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${status.playing ? "Pause" : "Play"} ${title.toLowerCase()}`}
        disabled={!status.isLoaded}
        style={[styles.play, { borderColor: color }]}
        onPress={() => void togglePlayback()}
      >
        {status.playing ? (
          <IconPause color={color} />
        ) : (
          <IconPlay color={color} />
        )}
      </Pressable>
      <View style={styles.details}>
        <Text style={[styles.label, { color }]}>{title}</Text>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel={`${title} playback position`}
          accessibilityValue={{
            text: `${voiceNoteTime(current)} of ${voiceNoteTime(duration)}`,
          }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (status.isLoaded)
              seek(
                current + (nativeEvent.actionName === "increment" ? 10 : -10),
              );
          }}
          disabled={!status.isLoaded || duration <= 0}
          hitSlop={{ top: 6, bottom: 6 }}
          onLayout={({ nativeEvent }) =>
            setTrackWidth(nativeEvent.layout.width)
          }
          onPress={({ nativeEvent }) => {
            if (trackWidth > 0)
              seek((nativeEvent.locationX / trackWidth) * duration);
          }}
          style={styles.seek}
        >
          <View
            pointerEvents="none"
            style={[styles.track, { backgroundColor: color }]}
          >
            <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
          </View>
        </Pressable>
        <Text style={[styles.duration, { color }]}>
          {seekFailed || status.error
            ? "Audio couldn’t play"
            : status.isLoaded
              ? `${voiceNoteTime(current)} / ${voiceNoteTime(duration)}`
              : "Loading audio…"}
        </Text>
      </View>
    </View>
  );
}

export function ChatAttachment({
  id,
  body,
  mine,
  api,
  activeAudio,
  onAudio,
}: {
  id: string;
  body: string;
  mine: boolean;
  api: Api;
  activeAudio: string | null;
  onAudio: (id: string) => void;
}) {
  const [value, setValue] = useState<{
    url: string;
    name: string;
    content_type: string;
    bytes: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const mounted = useRef(false);
  const audioFile = useRef<File | null>(null);
  const color = mine ? colors.void : colors.bone;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const file = audioFile.current;
      if (file?.exists) file.delete();
    };
  }, []);

  useEffect(() => {
    let active = true;
    void api.chat.attachment
      .download(id)
      .then((reply) => {
        if (!active) return;
        if (reply.error || !reply.data) throw new Error();
        setValue({ ...reply.data, url: privateMediaUrl(reply.data.url) });
      })
      .catch(() => {
        if (active) setError("Couldn’t load this attachment.");
      });
    return () => {
      active = false;
    };
  }, [api, id, retry]);

  async function fetchLink() {
    const reply = await api.chat.attachment.download(id);
    if (reply.error || !reply.data) throw new Error();
    return privateMediaUrl(reply.data.url);
  }

  async function loadAudio() {
    if (!value || audioFile.current) return;
    onAudio(id);
    setError(null);
    setAudioLoading(true);
    const extension =
      value.name.match(/\.(m4a|mp4|mp3|aac|wav|webm|ogg)$/i)?.[0] ?? "";
    const file = new File(
      Paths.cache,
      `chat-audio-${randomUUID()}${extension}`,
    );
    audioFile.current = file;
    try {
      await File.downloadFileAsync(await fetchLink(), file);
      if (!mounted.current) return;
      if (!file.size || file.size !== value.bytes) throw new Error();
      setAudioUri(file.uri);
    } catch {
      if (mounted.current) setError("Couldn’t load audio. Tap Play to retry.");
    } finally {
      if (!mounted.current || !file.size || file.size !== value.bytes) {
        if (file.exists) file.delete();
        audioFile.current = null;
      }
      if (mounted.current) setAudioLoading(false);
    }
  }

  const audio = value?.content_type.startsWith("audio/");
  const voice = !!value && audio && isVoiceNote(value.name);
  const title = voice ? "Voice note" : "Audio";
  const caption =
    !(voice && (body === value?.name || body === "Voice note")) &&
    body !== value?.name &&
    !isVoiceNote(body);

  return (
    <View style={styles.attachment}>
      {caption ? (
        <Text style={[styles.caption, { color }]} selectable>
          {body}
        </Text>
      ) : null}
      {value?.content_type.startsWith("image/") ? (
        <Image
          source={{ uri: value.url }}
          accessibilityLabel={value.name}
          style={styles.image}
          resizeMode="contain"
          onError={() => setError("Image didn’t load.")}
        />
      ) : null}
      {audio ? (
        audioUri ? (
          <AudioClip
            url={audioUri}
            title={title}
            color={color}
            active={activeAudio === id}
            activate={() => onAudio(id)}
            autoplay
          />
        ) : (
          <View style={styles.audio}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Play ${title.toLowerCase()}`}
              onPress={() => void loadAudio()}
              disabled={audioLoading}
              style={[styles.play, { borderColor: color }]}
            >
              <IconPlay color={color} />
            </Pressable>
            <Text style={[styles.label, { color }]}>
              {audioLoading ? "Loading audio…" : title}
            </Text>
          </View>
        )
      ) : value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${value.name}`}
          style={styles.link}
          onPress={() => {
            setError(null);
            void fetchLink()
              .then((url) => Linking.openURL(url))
              .catch(() => {
                setError("This device couldn’t open the file.");
              });
          }}
        >
          <Text style={[styles.label, { color }]} numberOfLines={2}>
            {value.name}
          </Text>
        </Pressable>
      ) : !error ? (
        <Text style={{ color }}>Loading attachment…</Text>
      ) : null}
      {error ? (
        <Text accessibilityLiveRegion="polite" style={{ color }}>
          {error}
        </Text>
      ) : null}
      {error && !audio ? (
        <Pressable
          accessibilityRole="button"
          style={styles.link}
          onPress={() => {
            setError(null);
            setRetry((count) => count + 1);
          }}
        >
          <Text style={[styles.label, { color }]}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  attachment: { gap: 6 },
  caption: { fontSize: 15, lineHeight: 21 },
  audio: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: 208,
    maxWidth: "100%",
    paddingVertical: 2,
  },
  play: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  details: { flex: 1, minWidth: 0 },
  label: { fontFamily: fonts.semibold, fontSize: 14 },
  duration: { fontFamily: fonts.mono, fontSize: 11 },
  seek: { height: 25, justifyContent: "center" },
  track: { height: 3, borderRadius: 2, overflow: "hidden" },
  trackFill: { height: 3, backgroundColor: colors.pink },
  image: { width: 240, maxWidth: "100%", height: 220, borderRadius: 12 },
  link: { minHeight: 40, justifyContent: "center" },
});
