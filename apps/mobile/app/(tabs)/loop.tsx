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
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { Link, router, useFocusEffect } from "expo-router";
import { useEvent, useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import * as Crypto from "expo-crypto";
import { LinearGradient } from "expo-linear-gradient";
import { useSession } from "../../src/session";
import { config, publicMediaUrl } from "../../src/config";
import { withCreators, type Film } from "../../src/data";
import { colors, fonts } from "../../src/theme";
import { Avatar } from "../../src/visuals";
import { Busy } from "../../src/ui";

function Action({
  label,
  onPress,
  disabled = false,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.action, primary && s.actionPrimary, disabled && { opacity: 0.4 }]}
    >
      <Text style={[s.actionText, primary && s.actionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

/** Only the visible, focused slide owns a native player. */
function Clip({
  film,
  uri,
  muted,
  onMute,
  autoplay,
}: {
  film: Film;
  uri: string;
  muted: boolean;
  onMute: () => void;
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
  const { status } = useEvent(player, "statusChange", {
    status: player.status,
  });
  useEffect(() => {
    if (autoplay) player.play();
    return () => player.pause();
  }, [player, autoplay]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- Native player properties are the expo-video control API.
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
        contentFit="contain"
        nativeControls={false}
        style={StyleSheet.absoluteFill}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "Pause preview" : "Play preview"}
        style={s.tap}
        onPress={() => {
          if (player.playing) player.pause();
          else player.play();
        }}
      >
        {!isPlaying && <Text style={s.play}>▶</Text>}
      </Pressable>
      <View style={s.sound}>
        <Action label={muted ? "Sound off" : "Sound on"} onPress={onMute} />
      </View>
      {status === "error" && (
        <Text accessibilityRole="alert" style={s.videoError}>
          Preview unavailable. You can still open the film.
        </Text>
      )}
    </>
  );
}

export default function Loop() {
  const { api, me } = useSession();
  const [films, setFilms] = useState<Film[]>([]);
  const [height, setHeight] = useState(600);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [muted, setMuted] = useState(true);
  const [reduced, setReduced] = useState(true);
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [preferences, setPreferences] = useState<Record<string, string>>({});
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
      const rows = await withCreators(api, result.data ?? []);
      const fresh = rows.filter((film) => {
        if (seen.current.has(film.id)) return false;
        seen.current.add(film.id);
        return true;
      });
      setFilms((previous) => [...previous, ...fresh]);
      more.current =
        rows.length === 10 && fresh.length > 0 && seen.current.size < 10000;
      setHasMore(more.current);
    } catch {
      if (version === generation.current)
        setError("Couldn’t load films. Try again.");
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
    // Reset the feed when the authenticated API session changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilms([]);
    setActiveIndex(0);
    setHasMore(true);
    setPreferences({});
    setNotice("");
    void load();
    return () => {
      generation.current = version + 1;
    };
  }, [load]);
  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.y / height);
    if (next >= 0 && next < films.length) setActiveIndex(next);
  }
  function move(offset: number) {
    const index = activeIndex + offset;
    if (index >= 0 && index < films.length)
      list.current?.scrollToIndex({ index, animated: !reduced });
    else if (offset > 0) void load();
  }
  async function feedback(film: Film, preference: "more" | "less") {
    if (!api || !me || feedbackBusy) return;
    setFeedbackBusy(true);
    try {
      const result = await api.loop.feedback(film.id, preference);
      if (result.error) throw result.error;
      setPreferences((value) => ({ ...value, [film.id]: preference }));
      setNotice(
        preference === "more"
          ? "We’ll suggest more films like this."
          : "We’ll suggest fewer films like this.",
      );
      if (preference === "less") move(1);
    } catch {
      setNotice("Couldn’t save that preference. Try again.");
    } finally {
      setFeedbackBusy(false);
    }
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
          feedbackBusy,
          preferences,
        }}
        renderItem={({ item: film, index }) => {
          const poster = publicMediaUrl(config.mediaOrigin, film.poster_key);
          const hook = publicMediaUrl(config.mediaOrigin, film.hook_key);
          return (
            <View style={[s.slide, { height }]}>
              {poster ? (
                <Image
                  source={{ uri: poster }}
                  resizeMode="contain"
                  style={StyleSheet.absoluteFill}
                  accessibilityLabel={`${film.title} poster`}
                />
              ) : (
                <Text style={s.fallback}>{film.title}</Text>
              )}
              {hook && index === activeIndex && focused && foreground && (
                <Clip
                  key={film.id}
                  film={film}
                  uri={hook}
                  muted={muted}
                  onMute={() => setMuted((value) => !value)}
                  autoplay={!reduced}
                />
              )}
              <View style={s.label}>
                <Text style={s.labelText}>
                  {hook ? "Film preview" : "Film poster"}
                </Text>
              </View>
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.88)"]}
                locations={[0, 0.45]}
                pointerEvents="none"
                style={s.detailsScrim}
              />
              <View style={s.details}>
                <Text style={s.meta}>
                  {film.genres.slice(0, 2).join(" · ")}
                </Text>
                <Link href={`/film/${film.id}`}>
                  <Text style={s.title} numberOfLines={2}>
                    {film.title}
                  </Text>
                </Link>
                {film.creator ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() =>
                      router.push({
                        pathname: "/u/[handle]",
                        params: { handle: film.creator!.handle },
                      })
                    }
                    style={s.creator}
                  >
                    <Avatar
                      picKey={film.creator.profile_pic_key}
                      name={film.creator.full_name}
                      size={28}
                    />
                    <Text style={s.creatorText}>
                      {film.creator.full_name}
                      <Text style={s.creatorHandle}> @{film.creator.handle}</Text>
                    </Text>
                  </Pressable>
                ) : null}
                <Text style={s.synopsis} numberOfLines={2}>
                  {film.synopsis}
                </Text>
                <Link href={`/film/${film.id}`} asChild>
                  <Pressable accessibilityRole="link" style={s.watch}>
                    <Text style={s.watchText}>▶ Watch film</Text>
                  </Pressable>
                </Link>
                {me ? (
                  <View style={s.feedback}>
                    <Action
                      label={
                        preferences[film.id] === "more"
                          ? "✓ More like this"
                          : "More like this"
                      }
                      primary={preferences[film.id] === "more"}
                      disabled={feedbackBusy}
                      onPress={() => void feedback(film, "more")}
                    />
                    <Action
                      label={
                        preferences[film.id] === "less"
                          ? "✓ Less like this"
                          : "Less like this"
                      }
                      disabled={feedbackBusy}
                      onPress={() => void feedback(film, "less")}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          !loading && !error ? (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>The first films are on their way.</Text>
              <Text style={s.synopsis}>
                Published films will appear here.
              </Text>
            </View>
          ) : undefined
        }
        ListFooterComponent={
          <View style={s.footer}>
            {loading ? (
              <Busy />
            ) : error ? (
              <>
                <Text style={s.synopsis}>{error}</Text>
                <Action label="Try again" onPress={() => void load()} />
              </>
            ) : hasMore ? (
              <Action label="Load more films" onPress={() => void load()} />
            ) : (
              <Text style={s.synopsis}>
                You’re all caught up. Come back for new films.
              </Text>
            )}
          </View>
        }
      />
      {notice ? (
        <Pressable
          onPress={() => setNotice("")}
          style={s.notice}
          accessibilityRole="button"
          accessibilityLabel={`${notice} Dismiss`}
        >
          <Text accessibilityLiveRegion="polite" style={s.noticeText}>
            {notice}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.void },
  slide: {
    backgroundColor: colors.void,
    justifyContent: "center",
    overflow: "hidden",
  },
  tap: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  play: {
    fontSize: 38,
    color: colors.bone,
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: 16,
    borderRadius: 30,
    overflow: "hidden",
  },
  sound: { position: "absolute", top: 12, right: 12, zIndex: 2 },
  label: {
    position: "absolute",
    top: 14,
    left: 14,
    zIndex: 2,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(26,26,27,0.8)",
    borderWidth: 1,
    borderColor: "rgba(243,239,233,0.12)",
  },
  labelText: {
    color: colors.bone,
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  detailsScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 220,
  },
  details: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingTop: 60,
    paddingBottom: 100,
    gap: 8,
  },
  title: { color: colors.text, fontFamily: fonts.extraBold, fontSize: 24, lineHeight: 28 },
  creator: { flexDirection: "row", alignItems: "center", gap: 8 },
  creatorText: { color: colors.bone, fontFamily: fonts.semibold, fontSize: 13 },
  creatorHandle: { color: colors.muted, fontFamily: fonts.regular },
  meta: { color: colors.bone, fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase" },
  synopsis: { color: colors.bone, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  feedback: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 40,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    justifyContent: "center",
  },
  actionPrimary: { backgroundColor: colors.bone, borderColor: colors.bone },
  actionText: { color: colors.bone, fontFamily: fonts.semibold, fontSize: 12 },
  actionTextPrimary: { color: colors.void },
  watch: {
    alignSelf: "flex-start",
    paddingVertical: 9,
    paddingHorizontal: 16,
    backgroundColor: colors.bone,
    borderRadius: 24,
    minHeight: 40,
    justifyContent: "center",
    marginTop: 2,
  },
  watchText: { color: colors.void, fontFamily: fonts.bold, fontSize: 13 },
  notice: {
    position: "absolute",
    top: 60,
    left: 15,
    right: 15,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(14,15,14,0.9)",
    borderWidth: 1,
    borderColor: "rgba(243,239,233,0.12)",
    zIndex: 3,
  },
  noticeText: { color: colors.bone, fontFamily: fonts.regular, fontSize: 13 },
  footer: { minHeight: 110, padding: 25, alignItems: "center", gap: 12 },
  empty: { padding: 30, gap: 8 },
  emptyTitle: { color: colors.text, fontFamily: fonts.extraBold, fontSize: 22 },
  fallback: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 40,
    textAlign: "center",
    padding: 30,
  },
  videoError: {
    position: "absolute",
    top: 70,
    left: 15,
    right: 15,
    color: colors.bone,
    backgroundColor: "rgba(0,0,0,0.8)",
    padding: 12,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
});
