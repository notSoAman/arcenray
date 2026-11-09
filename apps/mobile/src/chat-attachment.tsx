import { useCallback, useEffect, useState } from "react";
import { AppState, Image, Linking, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { File, UploadType } from "expo-file-system";
import type { Api } from "./session";
import { Button, Muted, Notice } from "./ui";
import { chatFileLimit } from "./chat-state";

export type SelectedChatFile = {
  uri: string;
  name: string;
  contentType: string;
  size: number;
  assetId?: string;
  uploaded?: boolean;
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

function AudioClip({
  url,
  active,
  activate,
}: {
  url: string;
  active: boolean;
  activate: () => void;
}) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") player.pause();
    });
    return () => sub.remove();
  }, [player]);
  return (
    <View style={{ gap: 6 }}>
      <Button
        title={status.playing ? "Pause audio" : "Play audio"}
        secondary
        onPress={() => {
          if (status.playing) player.pause();
          else {
            activate();
            if (status.didJustFinish) void player.seekTo(0);
            player.play();
          }
        }}
      />
      <Muted>
        {Math.floor(status.currentTime ?? 0)} /{" "}
        {Math.ceil(status.duration ?? 0)} seconds
      </Muted>
    </View>
  );
}
export function ChatAttachment({
  id,
  api,
  activeAudio,
  onAudio,
}: {
  id: string;
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
  useEffect(() => {
    let active = true;
    // Reset a previous request error before retrying the signed URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    void api.chat.attachment
      .download(id)
      .then((reply) => {
        if (!active) return;
        if (reply.error || !reply.data) {
          setError("Couldn’t load this attachment.");
          return;
        }
        try {
          setValue({ ...reply.data, url: privateMediaUrl(reply.data.url) });
        } catch {
          setError("This attachment is unavailable.");
        }
      })
      .catch(() => {
        if (active) setError("Couldn’t load this attachment.");
      });
    return () => {
      active = false;
    };
  }, [api, id, retry]);
  const refresh = useCallback(() => setRetry((x) => x + 1), []);
  // Refresh expiring links only for the currently mounted conversation.
  useEffect(() => {
    const timer = setInterval(refresh, 240000);
    return () => clearInterval(timer);
  }, [refresh]);
  return (
    <View style={{ gap: 8 }}>
      {value?.content_type.startsWith("image/") ? (
        <Image
          source={{ uri: value.url }}
          accessibilityLabel={value.name}
          style={{
            width: 240,
            maxWidth: "100%",
            height: 220,
            borderRadius: 12,
          }}
          resizeMode="contain"
          onError={() => setError("Image didn’t load. Try again.")}
        />
      ) : null}
      {value?.content_type.startsWith("audio/") ? (
        <AudioClip
          key={value.url}
          url={value.url}
          active={activeAudio === id}
          activate={() => onAudio(id)}
        />
      ) : null}
      {value ? (
        <Button
          title={`Open ${value.name}`}
          secondary
          onPress={() =>
            void Linking.openURL(value.url).catch(() =>
              setError("This device couldn’t open the file."),
            )
          }
        />
      ) : (
        <Muted>Loading attachment…</Muted>
      )}
      <Notice message={error} retry={refresh} />
    </View>
  );
}
