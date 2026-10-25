import { useState, useCallback, useRef } from "react";
import { AppState, View, Linking } from "react-native";
import { useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent, useEventListener } from "expo";
import * as Crypto from "expo-crypto";
import { WebView } from "react-native-webview";
import { config, publicMediaUrl } from "./config";
import { externalFilmUrl, type Film } from "./data";
import { useSession } from "./session";
import { Button, Notice, Muted } from "./ui";
function NativeVideo({
  uri,
  film,
  hook,
}: {
  uri: string;
  film: Film;
  hook: boolean;
}) {
  const [muted, setMuted] = useState(hook);
  const eventId = useRef(Crypto.randomUUID());
  const hookRecorded = useRef(false);
  const s = useSession();
  const player = useVideoPlayer(uri, (p) => {
    p.muted = hook;
    p.timeUpdateEventInterval = 1;
  });
  const status = useEvent(player, "statusChange", { status: player.status });
  useFocusEffect(
    useCallback(() => {
      const sub = AppState.addEventListener("change", (state) => {
        if (state !== "active") player.pause();
      });
      return () => {
        sub.remove();
        player.pause();
      };
    }, [player]),
  );
  useEventListener(player, "playToEnd", () => {
    if (!hook && s.me)
      void Promise.resolve(
        s.api?.events.record({
          film_id: film.id,
          kind: "film_complete",
          idempotency_key: eventId.current,
          watch_seconds: Math.min(86400, Math.max(0, player.duration)),
        }),
      ).catch(() => {});
  });
  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    if (hook && currentTime >= 10 && s.me && !hookRecorded.current) {
      hookRecorded.current = true;
      void Promise.resolve(
        s.api?.events.record({
          film_id: film.id,
          kind: "hook_watch",
          idempotency_key: eventId.current,
          watch_seconds: currentTime,
        }),
      ).catch(() => {});
    }
  });
  return (
    <View style={{ gap: 12 }}>
      <VideoView
        player={player}
        nativeControls
        fullscreenOptions={{ enable: true }}
        style={{ width: "100%", aspectRatio: 16 / 9 }}
      />
      <Button
        secondary
        title={muted ? "Turn sound on" : "Mute"}
        onPress={() => {
          // eslint-disable-next-line react-hooks/immutability -- expo-video exposes a mutable native player handle.
          player.muted = !muted;
          setMuted(!muted);
        }}
      />
      {status.status === "error" ? (
        <Notice message="This video could not play. Check your connection or try again later." />
      ) : null}
    </View>
  );
}
export function FilmPlayer({
  film,
  hook = false,
}: {
  film: Film;
  hook?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(AppState.currentState === "active");
  useFocusEffect(
    useCallback(() => {
      setActive(AppState.currentState === "active");
      const sub = AppState.addEventListener("change", (value) =>
        setActive(value === "active"),
      );
      return () => {
        sub.remove();
        setActive(false);
      };
    }, []),
  );
  const native = publicMediaUrl(
    config.mediaOrigin,
    hook ? film.hook_key : film.film_key,
  );
  const embed = externalFilmUrl(film, true);
  const external = externalFilmUrl(film);
  if (hook || film.source === "r2_native")
    return native ? (
      <NativeVideo key={native} uri={native} film={film} hook={hook} />
    ) : (
      <Muted>
        {hook
          ? "No discovery clip for this film."
          : "Playback is unavailable until media is ready and the media origin is configured."}
      </Muted>
    );
  return (
    <View style={{ gap: 12 }}>
      {!active ? (
        <Muted>Playback paused while this screen is away.</Muted>
      ) : embed && !failed ? (
        <WebView
          source={{ uri: embed }}
          style={{ width: "100%", height: 240, backgroundColor: "#000" }}
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction
          onError={() => setFailed(true)}
          onShouldStartLoadWithRequest={(request) => {
            try {
              const url = new URL(request.url);
              return (
                request.url === "about:blank" ||
                (url.protocol === "https:" &&
                  [
                    "www.youtube-nocookie.com",
                    "www.youtube.com",
                    "player.vimeo.com",
                  ].includes(url.hostname))
              );
            } catch {
              return false;
            }
          }}
        />
      ) : (
        <Notice message="The provider could not load this film here." />
      )}
      <Muted>
        Playback is provided by{" "}
        {film.source === "youtube_embed" ? "YouTube" : "Vimeo"} and follows its
        availability and restrictions.
      </Muted>
      {external ? (
        <Button
          title="Open with the video provider"
          secondary
          onPress={() => {
            void Linking.openURL(external);
          }}
        />
      ) : null}
    </View>
  );
}
