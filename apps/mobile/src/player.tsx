/* eslint-disable react-hooks/refs -- pan responder reads live layout/duration refs. */
/* eslint-disable react-hooks/immutability -- expo-video exposes a mutable native player handle. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AccessibilityInfo,
  useWindowDimensions,
  AppState,
  Image,
  Modal,
  PanResponder,
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useEvent, useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import * as Crypto from "expo-crypto";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { config, publicMediaUrl } from "./config";
import { externalFilmUrl, type Film } from "./data";
import { useSession } from "./session";
import { colors, fonts, radius } from "./theme";
import { IconButton } from "./ui";
import {
  IconExpand,
  IconPause,
  IconPlay,
  IconVolume,
  IconRewind,
  IconForward,
  IconChevronLeft,
} from "./icons";
import { seekTarget } from "./player-controls";
import { Poster, Spectrum } from "./visuals";

export function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ native */

function PosterFill({ uri, title }: { uri: string; title: string }) {
  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        backgroundColor: "#000",
      }}
    >
      <Image
        source={{ uri }}
        resizeMode="cover"
        blurRadius={26}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          opacity: 0.65,
        }}
        accessibilityIgnoresInvertColors
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: "rgba(14,15,14,0.35)",
        }}
      />
      <Image
        source={{ uri }}
        resizeMode="contain"
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        accessibilityLabel={`${title} poster`}
      />
    </View>
  );
}

function NativeFilm({
  uri,
  film,
  poster,
  autoPlay = false,
}: {
  uri: string;
  film: Film;
  poster: string | null;
  autoPlay?: boolean;
}) {
  const { api, me } = useSession();
  const insets = useSafeAreaInsets();
  const completeKey = useRef<string | null>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [controls, setControls] = useState(true);
  const [screenReader, setScreenReader] = useState(false);
  const [controlWake, setControlWake] = useState(0);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (mounted) setScreenReader(value);
    });
    const sub = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setScreenReader,
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(film.duration_seconds ?? 0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [engaged, setEngaged] = useState(autoPlay);

  const player = useVideoPlayer(uri, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.muted = false;
  });
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  useEffect(() => {
    if (!controls || !isPlaying || screenReader) return;
    const timer = setTimeout(() => setControls(false), 3500);
    return () => clearTimeout(timer);
  }, [controls, isPlaying, screenReader, controlWake]);
  function wakeControls() {
    setControls(true);
    setControlWake((value) => value + 1);
  }
  const [playerStatus, setPlayerStatus] = useState(player.status);
  useEventListener(player, "statusChange", ({ status }) => {
    setPlayerStatus(status);
    setWaiting(status === "loading");
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reflects native player error state.
    if (playerStatus === "error") setFailed(true);
  }, [playerStatus]);

  useEffect(() => {
    if (engaged) void player.play();
  }, [engaged, player]);

  useEventListener(player, "sourceLoad", ({ duration: loaded }) => {
    if (Number.isFinite(loaded) && loaded > 0) setDuration(loaded);
  });
  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    setTime(currentTime);
    setBuffered(player.bufferedPosition ?? 0);
  });
  useEventListener(player, "playToEnd", () => {
    if (me && api) {
      completeKey.current ??= Crypto.randomUUID();
      void Promise.resolve(
        api.events.record({
          film_id: film.id,
          kind: "film_complete",
          idempotency_key: completeKey.current,
          watch_seconds: Math.min(86400, Math.max(0, player.duration)),
        }),
      ).catch(() => {});
    }
  });

  useFocusEffect(
    useCallback(() => {
      const sub = AppState.addEventListener("change", (value) => {
        if (value !== "active") player.pause();
      });
      return () => {
        sub.remove();
        player.pause();
      };
    }, [player]),
  );

  function start() {
    setEngaged(true);
    wakeControls();
    void player.play();
  }

  function toggle() {
    wakeControls();
    if (player.playing) player.pause();
    else void player.play();
  }

  function seekTo(seconds: number) {
    wakeControls();
    player.currentTime = seekTarget(seconds, 0, duration);
    setTime(player.currentTime);
  }

  function toggleMute() {
    wakeControls();
    const next = !player.muted;
    player.muted = next;
    setMuted(next);
  }

  if (failed || playerStatus === "error")
    return (
      <PlayerMessage
        title="This film couldn't play."
        body="Your device may not support this file, or the connection dropped. Try again."
        action="Try again"
        onAction={() => {
          setFailed(false);
          player.replace(uri);
          void player.play();
        }}
      />
    );

  const visible = controls || !isPlaying || screenReader;
  const landscape = windowWidth > windowHeight;
  const videoFrame = (
    <View
      style={
        fullscreen
          ? { flex: 1, backgroundColor: "#000" }
          : { aspectRatio: 16 / 9, backgroundColor: "#000" }
      }
    >
      {engaged ? (
        <VideoView
          player={player}
          nativeControls={false}
          surfaceType="textureView"
          contentFit="contain"
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        />
      ) : poster ? (
        <PosterFill uri={poster} title={film.title} />
      ) : (
        <Spectrum />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          visible ? "Hide playback controls" : "Show playback controls"
        }
        accessibilityElementsHidden={screenReader}
        importantForAccessibility={screenReader ? "no" : "auto"}
        onPress={() => {
          if (!engaged) start();
          else if (visible && isPlaying) setControls(false);
          else wakeControls();
        }}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
      {visible ? (
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        >
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(0,0,0,0.45)", "transparent", "rgba(0,0,0,0.85)"]}
            locations={[0, 0.4, 1]}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
            }}
          />
          {fullscreen ? (
            <View
              style={{
                position: "absolute",
                top: insets.top + 8,
                left: insets.left + 12,
                right: insets.right + 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <IconButton
                label="Exit full screen"
                onPress={() => {
                  setFullscreen(false);
                  wakeControls();
                }}
                icon={<IconChevronLeft color={colors.bone} size={24} />}
                size={48}
              />
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontFamily: fonts.semibold,
                  fontSize: 18,
                  color: colors.bone,
                }}
              >
                {film.title}
              </Text>
            </View>
          ) : null}
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              top: "50%",
              marginTop: -28,
              left: 0,
              right: 0,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: fullscreen ? 36 : 24,
            }}
          >
            {engaged ? (
              <IconButton
                label="Back 10 seconds"
                size={48}
                glass={false}
                onPress={() =>
                  seekTo(seekTarget(player.currentTime, -10, duration))
                }
                icon={
                  <View style={{ alignItems: "center" }}>
                    <IconRewind color={colors.bone} size={26} />
                    <Text
                      style={{
                        fontFamily: fonts.semibold,
                        color: colors.bone,
                        fontSize: 10,
                      }}
                    >
                      10
                    </Text>
                  </View>
                }
              />
            ) : null}
            <IconButton
              label={isPlaying ? "Pause" : `Play ${film.title}`}
              size={fullscreen ? 56 : 48}
              tone="filled"
              onPress={engaged ? toggle : start}
              icon={
                isPlaying ? (
                  <IconPause color={colors.void} size={22} />
                ) : (
                  <IconPlay color={colors.void} size={20} />
                )
              }
            />
            {engaged ? (
              <IconButton
                label="Forward 10 seconds"
                size={48}
                glass={false}
                onPress={() =>
                  seekTo(seekTarget(player.currentTime, 10, duration))
                }
                icon={
                  <View style={{ alignItems: "center" }}>
                    <IconForward color={colors.bone} size={26} />
                    <Text
                      style={{
                        fontFamily: fonts.semibold,
                        color: colors.bone,
                        fontSize: 10,
                      }}
                    >
                      10
                    </Text>
                  </View>
                }
              />
            ) : null}
          </View>
          {engaged ? (
            <View
              style={{
                position: "absolute",
                left: (fullscreen ? insets.left : 0) + 16,
                right: (fullscreen ? insets.right : 0) + 16,
                bottom: fullscreen ? insets.bottom + (landscape ? 8 : 20) : 6,
                gap: 0,
              }}
            >
              <SeekBar
                time={time}
                duration={duration}
                buffered={buffered}
                onSeek={seekTo}
                big
              />
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Text
                  style={{
                    flex: 1,
                    color: colors.bone,
                    fontFamily: fonts.semibold,
                    fontSize: 13,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {formatClock(time)}{" "}
                  <Text style={{ color: colors.textSoft }}>
                    / {formatClock(duration)}
                  </Text>
                </Text>
                <IconButton
                  label={muted ? "Unmute" : "Mute"}
                  onPress={toggleMute}
                  size={44}
                  glass={false}
                  icon={
                    <IconVolume color={colors.bone} muted={muted} size={21} />
                  }
                />
                <IconButton
                  label={fullscreen ? "Exit full screen" : "Full screen"}
                  onPress={() => {
                    if (!engaged) start();
                    setFullscreen(!fullscreen);
                    wakeControls();
                  }}
                  size={44}
                  glass={false}
                  icon={<IconExpand color={colors.bone} size={21} />}
                />
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
      {waiting ? (
        <ActivityIndicator
          pointerEvents="none"
          accessibilityLabel="Buffering film"
          color={colors.bone}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            marginLeft: -12,
            marginTop: -12,
          }}
        />
      ) : null}
    </View>
  );

  return (
    <View
      style={{ borderRadius: 18, overflow: "hidden", backgroundColor: "#000" }}
    >
      {fullscreen ? (
        <View style={{ aspectRatio: 16 / 9, backgroundColor: "#000" }} />
      ) : (
        videoFrame
      )}
      <Modal
        visible={fullscreen}
        animationType="fade"
        presentationStyle="fullScreen"
        supportedOrientations={["portrait", "landscape"]}
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {
          setFullscreen(false);
          wakeControls();
        }}
      >
        {fullscreen ? videoFrame : null}
      </Modal>
    </View>
  );
}

function SeekBar({
  time,
  duration,
  buffered,
  onSeek,
  big = false,
}: {
  time: number;
  duration: number;
  buffered: number;
  onSeek: (t: number) => void;
  big?: boolean;
}) {
  const width = useRef(1);
  const startX = useRef(0);
  const durationRef = useRef(duration);
  const onSeekRef = useRef(onSeek);
  useEffect(() => {
    durationRef.current = duration;
    onSeekRef.current = onSeek;
  }, [duration, onSeek]);
  const seek = (x: number) => {
    const ratio = Math.max(0, Math.min(1, x / width.current));
    onSeekRef.current(ratio * (durationRef.current || 0));
  };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          startX.current = e.nativeEvent.locationX;
          seek(startX.current);
        },
        onPanResponderMove: (_, g) => seek(startX.current + g.dx),
      }),
    // The responder reads the latest duration through a ref.
    [],
  );
  const max = Math.max(duration, 0.1);
  const pct = Math.min(100, (time / max) * 100);
  const buf = Math.min(100, (buffered / max) * 100);
  return (
    <View
      onLayout={(e) => {
        width.current = Math.max(1, e.nativeEvent.layout.width);
      }}
      style={{
        flex: 1,
        height: big ? 34 : 28,
        justifyContent: "center",
      }}
      {...responder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel="Seek"
      accessibilityActions={[
        { name: "increment", label: "Forward 10 seconds" },
        { name: "decrement", label: "Back 10 seconds" },
      ]}
      onAccessibilityAction={(event) =>
        onSeek(
          seekTarget(
            time,
            event.nativeEvent.actionName === "increment" ? 10 : -10,
            duration,
          ),
        )
      }
      accessibilityValue={{
        min: 0,
        max: Math.round(max),
        now: Math.round(time),
      }}
    >
      <View
        style={{
          height: big ? 5 : 4,
          borderRadius: 3,
          backgroundColor: "rgba(243,239,233,0.2)",
          overflow: "hidden",
        }}
      >
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${buf}%`,
            backgroundColor: "rgba(243,239,233,0.32)",
          }}
        />
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct}%`,
            backgroundColor: colors.ember,
          }}
        />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: `${pct}%`,
          marginLeft: -7,
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: colors.bone,
          shadowColor: colors.ember,
          shadowOpacity: 0.7,
          shadowRadius: 8,
          elevation: 4,
        }}
      />
    </View>
  );
}

/* ------------------------------------------------------------------- embed */

function youtubeHtml(id: string) {
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
<meta name="referrer" content="origin" />
<base href="https://arcenray.com/" />
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style>
</head>
<body>
<div id="player"></div>
<script>
  function send(type, data){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:type, data:data||null}));
  }
  var tag=document.createElement('script');
  tag.src='https://www.youtube.com/iframe_api';
  tag.onerror=function(){ send('error', 153); };
  document.head.appendChild(tag);
  function onYouTubeIframeAPIReady(){
    new YT.Player('player', {
      videoId: '${id}',
      playerVars: {
        autoplay: 1,
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        enablejsapi: 1,
        origin: 'https://arcenray.com',
        widget_referrer: 'https://arcenray.com'
      },
      events: {
        onReady: function(e){ send('ready'); e.target.playVideo(); },
        onStateChange: function(e){ if(e.data===1) send('playing'); if(e.data===0) send('ended'); },
        onError: function(e){ send('error', e.data); }
      }
    });
  }
</script>
</body>
</html>`;
}

function ProviderEmbed({
  film,
  poster,
  autoPlay = false,
}: {
  film: Film;
  poster: string | null;
  autoPlay?: boolean;
}) {
  const [started, setStarted] = useState(autoPlay);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const provider = film.source === "youtube_embed" ? "YouTube" : "Vimeo";
  const youtubeId =
    film.source === "youtube_embed" &&
    film.provider_id &&
    /^[A-Za-z0-9_-]{11}$/.test(film.provider_id)
      ? film.provider_id
      : null;
  const thumbnail = youtubeId
    ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
    : poster;

  function onMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {
        type: string;
        data?: number | null;
      };
      if (message.type === "ready") setReady(true);
      if (message.type === "playing") {
        setPlaying(true);
        setReady(true);
      }
      if (message.type === "error") {
        setFailed(true);
        setReady(true);
      }
    } catch {
      /* ignore non-player messages */
    }
  }

  useEffect(() => {
    if (!started || ready || failed) return;
    const timer = setTimeout(() => setFailed(true), 14000);
    return () => clearTimeout(timer);
  }, [started, ready, failed]);

  if (!started)
    return (
      <View style={{ gap: 8 }}>
        <View
          style={{
            borderRadius: 22,
            overflow: "hidden",
            backgroundColor: "#000",
          }}
        >
          <View style={{ aspectRatio: 16 / 9 }}>
            {thumbnail ? (
              <PosterFill uri={thumbnail} title={film.title} />
            ) : (
              <Poster
                posterKey={film.poster_key}
                title={film.title}
                aspect={16 / 9}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                }}
              />
            )}
            <LinearGradient
              colors={["rgba(14,15,14,0.15)", "rgba(14,15,14,0.7)"]}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Play ${film.title} on ${provider}`}
              onPress={() => setStarted(true)}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 34,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(243,239,233,0.92)",
                }}
              >
                <IconPlay size={25} color={colors.void} />
              </View>
              <Text
                style={{
                  color: colors.bone,
                  fontFamily: fonts.monoBold,
                  fontSize: 10,
                  letterSpacing: 1.6,
                  textTransform: "uppercase",
                }}
              >
                Play on {provider}
              </Text>
            </Pressable>
          </View>
        </View>
        <Text
          style={{
            color: colors.faint,
            fontFamily: fonts.regular,
            fontSize: 12,
            lineHeight: 17,
            paddingHorizontal: 4,
          }}
        >
          Playing from {provider}. Their player, controls and terms apply.
        </Text>
      </View>
    );

  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          borderRadius: 22,
          overflow: "hidden",
          backgroundColor: "#000",
        }}
      >
        <View style={{ aspectRatio: 16 / 9 }}>
          {failed ? (
            <View style={{ flex: 1 }}>
              <PlayerMessage
                title={`${provider} couldn't play this here.`}
                body="The provider blocked or changed this embed. Playback follows their availability and restrictions."
                compact
              />
            </View>
          ) : (
            <WebView
              source={
                youtubeId
                  ? {
                      html: youtubeHtml(youtubeId),
                      baseUrl: "https://arcenray.com/",
                    }
                  : { uri: externalFilmUrl(film, true) ?? "about:blank" }
              }
              style={{ flex: 1, backgroundColor: "#000" }}
              javaScriptEnabled
              domStorageEnabled
              allowsFullscreenVideo
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback
              setSupportMultipleWindows={false}
              androidLayerType="hardware"
              onMessage={onMessage}
              onError={() => setFailed(true)}
              onHttpError={() => setFailed(true)}
              onLoadEnd={() => {
                if (film.source !== "youtube_embed") setReady(true);
              }}
              originWhitelist={["*"]}
            />
          )}
          {!ready && !failed ? (
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(14,15,14,0.65)",
              }}
            >
              <ActivityIndicator color={colors.bone} />
              <Text
                style={{
                  color: colors.muted,
                  fontFamily: fonts.regular,
                  fontSize: 12,
                  marginTop: 10,
                }}
              >
                Connecting to {provider}…
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ paddingHorizontal: 4 }}>
        <Text
          style={{
            color: colors.faint,
            fontFamily: fonts.regular,
            fontSize: 12,
            lineHeight: 17,
          }}
        >
          {failed
            ? "Provider playback follows their availability and restrictions."
            : playing
              ? `Playing from ${provider}. Their controls apply.`
              : `Playing from ${provider}.`}
        </Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------- shell */

function PlayerMessage({
  title,
  body,
  action,
  onAction,
  compact = false,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <View
      style={{
        aspectRatio: compact ? 16 / 9 : undefined,
        minHeight: compact ? undefined : 210,
        borderRadius: compact ? 0 : 22,
        overflow: "hidden",
        backgroundColor: colors.plum,
      }}
    >
      <Spectrum
        kind="hero"
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: "rgba(14,15,14,0.78)",
        }}
      />
      <View
        style={{
          flex: 1,
          minHeight: compact ? undefined : 210,
          padding: 24,
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <Text
          style={{
            color: colors.bone,
            fontFamily: fonts.extraBold,
            fontSize: 20,
            letterSpacing: -0.4,
            textAlign: "center",
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: colors.textSoft,
            fontFamily: fonts.regular,
            fontSize: 13,
            lineHeight: 19,
            textAlign: "center",
            maxWidth: 330,
          }}
        >
          {body}
        </Text>
        {action && onAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
            style={{
              marginTop: 6,
              minHeight: 40,
              paddingHorizontal: 18,
              borderRadius: 20,
              backgroundColor: colors.bone,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: colors.void,
                fontFamily: fonts.bold,
                fontSize: 13,
              }}
            >
              {action}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function FilmPlayer({
  film,
  hook = false,
  autoPlay = false,
}: {
  film: Film;
  hook?: boolean;
  autoPlay?: boolean;
}) {
  const native = publicMediaUrl(
    config.mediaOrigin,
    hook ? film.hook_key : film.film_key,
  );
  const poster = publicMediaUrl(config.mediaOrigin, film.poster_key);
  if (hook || film.source === "r2_native") {
    if (!native)
      return (
        <PlayerMessage
          title={
            hook
              ? "No discovery clip for this film."
              : "Playback is not ready yet."
          }
          body={
            hook
              ? "The creator has not added a preview for this film."
              : "The creator's video is still being prepared. Check back soon."
          }
        />
      );
    return (
      <NativeFilm
        key={native}
        uri={native}
        film={film}
        poster={poster}
        autoPlay={autoPlay}
      />
    );
  }
  return <ProviderEmbed film={film} poster={poster} autoPlay={autoPlay} />;
}
