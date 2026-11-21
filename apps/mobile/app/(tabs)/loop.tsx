import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useEvent, useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import * as Crypto from "expo-crypto";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../src/session";
import { config, publicMediaUrl } from "../../src/config";
import { duration, withCreators, type Film } from "../../src/data";
import { colors, fonts, radius } from "../../src/theme";
import { Avatar, Spectrum } from "../../src/visuals";
import { IconPlay, IconVolume } from "../../src/icons";
import { Busy, IconButton, Kicker } from "../../src/ui";

function Clip({
  film,
  uri,
  muted,
  autoplay,
}: {
  film: Film;
  uri: string;
  muted: boolean;
  autoplay: boolean;
}) {
  const { api, me } = useSession();
  const recorded = useRef(false);
  const eventId = useRef(Crypto.randomUUID());
  const player = useVideoPlayer(uri, (value) => {
    value.loop = true;
    value.muted = muted;
    value.timeUpdateEventInterval = 1;
  });
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  const [playerStatus, setPlayerStatus] = useState(player.status);
  useEventListener(player, "statusChange", ({ status }) =>
    setPlayerStatus(status),
  );
  useEffect(() => {
    if (autoplay) player.play();
    return () => player.pause();
  }, [player, autoplay]);
  useEffect(() => {
    // expo-video's mutable native handle is the documented control surface.
    // eslint-disable-next-line react-hooks/immutability
    player.muted = muted;
  }, [player, muted]);
  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    if (me && !recorded.current && currentTime >= 10) {
      recorded.current = true;
      void Promise.resolve(
        api?.events.record({
          film_id: film.id,
          kind: "hook_watch",
          idempotency_key: eventId.current,
          watch_seconds: currentTime,
        }),
      ).catch(() => {});
    }
  });
  return (
    <>
      <VideoView
        player={player}
        contentFit="cover"
        nativeControls={false}
        style={StyleSheet.absoluteFill}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "Pause preview" : "Play preview"}
        style={StyleSheet.absoluteFill}
        onPress={() => {
          if (player.playing) player.pause();
          else player.play();
        }}
      >
        {!isPlaying ? (
          <View
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              marginLeft: -30,
              marginTop: -30,
              width: 60,
              height: 60,
              borderRadius: 30,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(243,239,233,0.9)",
            }}
          >
            <IconPlay size={22} color={colors.void} />
          </View>
        ) : null}
      </Pressable>
      {playerStatus === "error" ? (
        <Text accessibilityRole="alert" style={s.videoError}>
          Preview unavailable. You can still open the film.
        </Text>
      ) : null}
    </>
  );
}

function Slide({
  film,
  height,
  active,
  muted,
  onMute,
  focused,
  foreground,
  reduced,
}: {
  film: Film;
  height: number;
  active: boolean;
  muted: boolean;
  onMute: () => void;
  focused: boolean;
  foreground: boolean;
  reduced: boolean;
}) {
  const insets = useSafeAreaInsets();
  const poster = publicMediaUrl(config.mediaOrigin, film.poster_key);
  const hook = publicMediaUrl(config.mediaOrigin, film.hook_key);
  const [posterFailed, setPosterFailed] = useState(false);
  const creator = film.creator;
  const metadata = [film.genres[0], duration(film.duration_seconds)]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={[s.slide, { height }]}>
      {poster && !posterFailed ? (
        <Image
          source={{ uri: poster }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          onError={() => setPosterFailed(true)}
          accessibilityLabel={`${film.title} poster`}
        />
      ) : (
        <View style={StyleSheet.absoluteFill}>
          <Spectrum kind="hero" style={StyleSheet.absoluteFill} />
        </View>
      )}
      <LinearGradient
        colors={[
          "rgba(14,15,14,0.35)",
          "rgba(14,15,14,0)",
          "rgba(14,15,14,0.55)",
          "rgba(14,15,14,0.98)",
        ]}
        locations={[0, 0.22, 0.58, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {hook && active && focused && foreground ? (
        <Clip
          key={film.id}
          film={film}
          uri={hook}
          muted={muted}
          autoplay={!reduced}
        />
      ) : null}

      <View style={s.top}>
        <View style={{ flex: 1 }} />
        {hook ? (
          <IconButton
            label={muted ? "Turn sound on" : "Mute preview"}
            onPress={onMute}
            icon={<IconVolume size={18} color={colors.bone} muted={muted} />}
          />
        ) : null}
      </View>

      <View style={s.details}>
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            router.push({ pathname: "/film/[id]", params: { id: film.id } })
          }
        >
          <Text style={s.title} numberOfLines={2}>
            {film.title}
          </Text>
        </Pressable>
        {metadata ? <Text style={s.metadata}>{metadata}</Text> : null}
        {creator ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`View ${creator.full_name || creator.handle}’s profile`}
            onPress={() =>
              router.push({
                pathname: "/u/[handle]",
                params: { handle: creator.handle },
              })
            }
            style={({ pressed }) => [s.creator, pressed && { opacity: 0.8 }]}
          >
            <Avatar
              picKey={creator.profile_pic_key}
              name={creator.full_name || creator.handle}
              size={32}
            />
            <Text style={s.creatorName} numberOfLines={1}>
              {creator.full_name || `@${creator.handle}`}
            </Text>
          </Pressable>
        ) : null}
        <View style={s.actions}>
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              router.push({ pathname: "/film/[id]", params: { id: film.id } })
            }
            style={({ pressed }) => [s.watch, pressed && { opacity: 0.8 }]}
          >
            <IconPlay size={13} color={colors.void} />
            <Text style={s.watchText}>Watch film</Text>
          </Pressable>
        </View>
      </View>
      <View style={{ height: 92 + insets.bottom }} pointerEvents="none" />
    </View>
  );
}

export default function Loop() {
  const { api } = useSession();
  const insets = useSafeAreaInsets();
  const [films, setFilms] = useState<Film[]>([]);
  const [height, setHeight] = useState(600);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(true);
  const [reduced, setReduced] = useState(true);
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const seen = useRef(new Set<string>());
  const busy = useRef(false);
  const more = useRef(true);
  const generation = useRef(0);
  const list = useRef<FlatList<Film>>(null);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (live) setReduced(value);
    });
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    const app = AppState.addEventListener("change", (value) =>
      setForeground(value === "active"),
    );
    return () => {
      live = false;
      motion.remove();
      app.remove();
    };
  }, []);

  const load = useCallback(async () => {
    if (!api || busy.current || !more.current) return;
    busy.current = true;
    setLoading(true);
    setError("");
    const version = generation.current;
    try {
      const result = await api.loop.page([...seen.current], 10);
      if (version !== generation.current) return;
      if (result.error) throw result.error;
      const rows = (result.data ?? []) as Film[];
      const fresh = rows.filter((film) => {
        if (seen.current.has(film.id)) return false;
        seen.current.add(film.id);
        return true;
      });
      const attached = await withCreators(api, fresh).catch(() => fresh);
      if (version !== generation.current) return;
      setFilms((previous) => [...previous, ...attached]);
      more.current = rows.length === 10 && fresh.length > 0;
      setHasMore(more.current);
    } catch {
      if (version === generation.current)
        setError("Couldn't load films. Try again.");
    } finally {
      if (version === generation.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, [api]);

  useEffect(() => {
    const version = ++generation.current;
    seen.current.clear();
    busy.current = false;
    more.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset feed when the session changes.
    setFilms([]);
    setActiveIndex(0);
    setHasMore(true);
    void load();
    return () => {
      generation.current = version + 1;
    };
  }, [load]);

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.y / height);
    if (next >= 0 && next < films.length) setActiveIndex(next);
  }

  return (
    <View
      style={s.screen}
      onLayout={(event) =>
        setHeight(Math.max(200, event.nativeEvent.layout.height))
      }
    >
      <FlatList
        ref={list}
        data={films}
        keyExtractor={(film) => film.id}
        snapToInterval={height}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: height,
          offset: height * index,
          index,
        })}
        onMomentumScrollEnd={onMomentumEnd}
        onEndReached={() => {
          if (!error) void load();
        }}
        onEndReachedThreshold={2}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        windowSize={3}
        extraData={{
          activeIndex,
          height,
          muted,
          focused,
          foreground,
          reduced,
        }}
        renderItem={({ item: film, index }) => (
          <Slide
            film={film}
            height={height}
            active={index === activeIndex}
            muted={muted}
            onMute={() => setMuted((value) => !value)}
            focused={focused}
            foreground={foreground}
            reduced={reduced}
          />
        )}
        ListEmptyComponent={
          !loading && !error ? (
            <View style={[s.empty, { height }]}>
              <Kicker color={colors.pink}>Loop</Kicker>
              <Text style={s.emptyTitle}>
                The first films are on their way.
              </Text>
              <Text style={s.synopsis}>Published films will appear here.</Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push("/home")}
                style={s.watch}
              >
                <Text style={s.watchText}>Back to Home</Text>
              </Pressable>
            </View>
          ) : loading ? (
            <Busy label="Loading the next films…" />
          ) : (
            <View style={[s.empty, { height }]}>
              <Text style={s.emptyTitle}>Loop couldn't load.</Text>
              <Text style={s.synopsis}>{error}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void load()}
                style={s.watch}
              >
                <Text style={s.watchText}>Try again</Text>
              </Pressable>
            </View>
          )
        }
        ListFooterComponent={
          films.length > 0 ? (
            <View style={[s.footer, { paddingBottom: 110 + insets.bottom }]}>
              {loading ? (
                <Busy />
              ) : hasMore ? null : (
                <Text style={s.synopsis}>
                  You're all caught up. Come back for new films.
                </Text>
              )}
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.void },
  slide: {
    backgroundColor: colors.void,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  top: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 2,
  },
  details: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 8,
    gap: 9,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.extraBold,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: -1.2,
  },
  metadata: { color: colors.textSoft, fontFamily: fonts.regular, fontSize: 14 },
  creator: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    minHeight: 44,
    gap: 8,
  },
  creatorName: {
    color: colors.bone,
    fontFamily: fonts.bold,
    fontSize: 14,
    flexShrink: 1,
  },
  synopsis: {
    color: colors.textSoft,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  watch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 18,
    backgroundColor: colors.bone,
    borderRadius: 22,
    justifyContent: "center",
  },
  watchText: { color: colors.void, fontFamily: fonts.bold, fontSize: 13 },
  footer: { paddingHorizontal: 24, paddingTop: 18, alignItems: "center" },
  empty: {
    padding: 28,
    gap: 12,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: fonts.extraBold,
    fontSize: 28,
    lineHeight: 31,
    letterSpacing: -0.7,
  },
  videoError: {
    position: "absolute",
    top: 70,
    left: 15,
    right: 15,
    color: colors.bone,
    backgroundColor: "rgba(0,0,0,0.8)",
    padding: 12,
    borderRadius: 12,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
});
