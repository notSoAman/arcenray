/* eslint-disable react-hooks/immutability -- expo-video exposes a mutable native player handle. */
import { useCallback, useState } from "react";
import { AppState, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent, useEventListener } from "expo";
import { LinearGradient } from "expo-linear-gradient";
import { config, publicMediaUrl } from "./config";
import { colors, fonts, radius } from "./theme";
import { Poster } from "./visuals";
import { IconPause, IconPlay, IconVolume } from "./icons";
import { haptic } from "./ui";

/**
 * The web's <HookPreview> on a phone: the poster stays calm until the viewer
 * explicitly asks for the 30-second hook. Playback is muted by default, owned
 * by this component, and stops when the screen loses focus.
 */
export function HookPreview({
  hookKey,
  posterKey,
  title,
  aspect = 2 / 3,
  style,
  rounded = true,
}: {
  hookKey: string | null | undefined;
  posterKey: string | null | undefined;
  title: string;
  aspect?: number;
  style?: StyleProp<ViewStyle>;
  rounded?: boolean;
}) {
  const [active, setActive] = useState(false);
  const hook = publicMediaUrl(config.mediaOrigin, hookKey ?? null);
  if (!active || !hook)
    return (
      <View style={[{ width: "100%" }, style]}>
        <Poster posterKey={posterKey} title={title} aspect={aspect} rounded={rounded} />
        {hook ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Preview ${title}`}
            onPress={() => {
              haptic("medium");
              setActive(true);
            }}
            style={({ pressed }) => ({
              position: "absolute",
              left: 10,
              bottom: 10,
              minHeight: 36,
              paddingHorizontal: 12,
              borderRadius: 18,
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              backgroundColor: "rgba(14,15,14,0.72)",
              borderWidth: 1,
              borderColor: "rgba(243,239,233,0.18)",
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <IconPlay size={11} color={colors.bone} />
            <Text
              style={{
                color: colors.bone,
                fontFamily: fonts.monoBold,
                fontSize: 10,
                letterSpacing: 1.2,
                textTransform: "uppercase",
              }}
            >
              Preview
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  return (
    <Preview
      uri={hook}
      style={style}
      rounded={rounded}
      onClose={() => setActive(false)}
    />
  );
}

function Preview({
  uri,
  rounded,
  style,
  onClose,
}: {
  uri: string;
  rounded: boolean;
  style?: StyleProp<ViewStyle>;
  onClose: () => void;
}) {
  const [muted, setMuted] = useState(true);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const [ended, setEnded] = useState(false);
  useEventListener(player, "playToEnd", () => setEnded(true));
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
  function toggle() {
    setEnded(false);
    if (player.playing) player.pause();
    else {
      if (player.currentTime >= player.duration) player.currentTime = 0;
      player.play();
    }
  }
  return (
    <View
      style={[
        {
          width: "100%",
          height: "100%",
          borderRadius: rounded ? radius.poster : 0,
          overflow: "hidden",
          backgroundColor: "#000",
        },
        style,
      ]}
    >
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="contain"
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <LinearGradient
        colors={["rgba(14,15,14,0)", "rgba(14,15,14,0.7)"]}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 72 }}
        pointerEvents="none"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "Pause preview" : "Play preview"}
        onPress={toggle}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      >
        {!isPlaying ? (
          <View
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              marginLeft: -26,
              marginTop: -26,
              width: 52,
              height: 52,
              borderRadius: 26,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(243,239,233,0.92)",
            }}
          >
            <IconPlay size={20} color={colors.void} />
          </View>
        ) : null}
      </Pressable>
      <View
        style={{
          position: "absolute",
          right: 8,
          bottom: 8,
          flexDirection: "row",
          gap: 6,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={muted ? "Turn preview sound on" : "Mute preview"}
          onPress={() => {
            const next = !muted;
            player.muted = next;
            setMuted(next);
          }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(14,15,14,0.72)",
            borderWidth: 1,
            borderColor: "rgba(243,239,233,0.18)",
          }}
        >
          <IconVolume size={17} color={colors.bone} muted={muted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close preview"
          onPress={() => {
            player.pause();
            onClose();
          }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(14,15,14,0.72)",
            borderWidth: 1,
            borderColor: "rgba(243,239,233,0.18)",
          }}
        >
          <IconPause size={13} color={colors.bone} />
        </Pressable>
      </View>
      {ended ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Play preview again"
          onPress={toggle}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(14,15,14,0.55)",
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(243,239,233,0.92)",
            }}
          >
            <IconPlay size={22} color={colors.void} />
          </View>
          <Text style={{ color: colors.bone, fontFamily: fonts.semibold, fontSize: 12, marginTop: 10 }}>
            Watch preview again
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
