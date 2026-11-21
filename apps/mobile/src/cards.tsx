import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Poster, Avatar, Spectrum } from "./visuals";
import { colors, fonts, gradients, radius, shadow } from "./theme";
import { duration, byline, personRole, type Film } from "./data";
import { HookPreview } from "./hook-preview";
import { Button, haptic } from "./ui";
import { IconPlay } from "./icons";

function Badge({ label }: { label: string }) {
  return (
    <View
      style={{
        position: "absolute",
        right: 8,
        bottom: 8,
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 10,
        backgroundColor: "rgba(14, 15, 14, 0.82)",
      }}
    >
      <Text style={{ color: colors.bone, fontFamily: fonts.semibold, fontSize: 12 }}>
        {label}
      </Text>
    </View>
  );
}

function meta(film: Film) {
  return [film.genres[0], duration(film.duration_seconds)]
    .filter(Boolean)
    .join(" · ");
}

/** Portrait poster card (home grid, picks). */
export function PosterCard({ film }: { film: Film }) {
  const sub = byline(film) ?? meta(film);
  return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Watch ${film.title}`}
        onPress={() => {
          haptic();
          router.push({ pathname: "/film/[id]", params: { id: film.id } });
        }}
        style={({ pressed }) => ({
          gap: 9,
          flex: 1,
          minWidth: 0,
          opacity: pressed ? 0.82 : 1,
          transform: [{ translateY: pressed ? -1 : 0 }],
        })}
      >
        <View>
          <Poster posterKey={film.poster_key} title={film.title} aspect={2 / 3} rounded />
          {duration(film.duration_seconds) ? (
            <Badge label={duration(film.duration_seconds)} />
          ) : null}
        </View>
        <Text
          numberOfLines={2}
          style={{
            color: colors.text,
            fontFamily: fonts.bold,
            fontSize: 16,
            lineHeight: 20,
            letterSpacing: -0.2,
          }}
        >
          {film.title}
        </Text>
        {sub ? (
          <Text
            numberOfLines={1}
            style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13, marginTop: -3 }}
          >
            {sub}
          </Text>
        ) : null}
      </Pressable>
  );
}

/** Landscape card (profile films, related films). */
export function WideCard({ film, note }: { film: Film; note?: string | null }) {
  const sub = [byline(film) ?? meta(film), note].filter(Boolean).join(" · ");
  return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Watch ${film.title}`}
        onPress={() => {
          haptic();
          router.push({ pathname: "/film/[id]", params: { id: film.id } });
        }}
        style={({ pressed }) => ({ gap: 9, opacity: pressed ? 0.82 : 1 })}
      >
        <View>
          <Poster posterKey={film.poster_key} title={film.title} aspect={16 / 9} rounded />
          {duration(film.duration_seconds) ? (
            <Badge label={duration(film.duration_seconds)} />
          ) : null}
        </View>
        <Text
          numberOfLines={1}
          style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16, letterSpacing: -0.2 }}
        >
          {film.title}
        </Text>
        {sub ? (
          <Text
            numberOfLines={1}
            style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13, marginTop: -3 }}
          >
            {sub}
          </Text>
        ) : null}
      </Pressable>
  );
}

/** Search / discovery result row with a small poster. */
export function RowCard({ film }: { film: Film }) {
  const sub = [film.creator?.full_name, film.genres[0], film.location_city]
    .filter(Boolean)
    .join(" · ");
  return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Watch ${film.title}`}
        onPress={() => {
          haptic();
          router.push({ pathname: "/film/[id]", params: { id: film.id } });
        }}
        style={({ pressed }) => ({
          flexDirection: "row",
          gap: 14,
          padding: 12,
          borderRadius: 22,
          backgroundColor: pressed ? colors.graphiteRaised : colors.graphite,
        })}
      >
        <View style={{ width: 104 }}>
          <Poster posterKey={film.poster_key} title={film.title} aspect={2 / 3} rounded />
          {duration(film.duration_seconds) ? (
            <Badge label={duration(film.duration_seconds)} />
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 6, paddingVertical: 4, minWidth: 0 }}>
          <Text
            numberOfLines={2}
            style={{ color: colors.text, fontFamily: fonts.extraBold, fontSize: 18, letterSpacing: -0.3 }}
          >
            {film.title}
          </Text>
          {sub ? (
            <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }}>
              {sub}
            </Text>
          ) : null}
          {film.synopsis ? (
            <Text
              numberOfLines={3}
              style={{ color: colors.textSoft, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 }}
            >
              {film.synopsis}
            </Text>
          ) : null}
        </View>
      </Pressable>
  );
}

/** Cinematic spectrum panel with the poster on a calm surface (W1, W2). */
export function FeaturedFilm({ film, kicker }: { film: Film; kicker: string }) {
  const by = byline(film, { role: true });
  const sub = [film.genres[0], duration(film.duration_seconds)]
    .filter(Boolean)
    .join(" · ");
  const open = () =>
    router.push({ pathname: "/film/[id]", params: { id: film.id } });
  const play = () =>
    router.push({ pathname: "/film/[id]", params: { id: film.id, play: "1" } });
  return (
    <View
      style={{
        borderRadius: radius.panel,
        overflow: "hidden",
        backgroundColor: colors.plum,
      }}
    >
      <Spectrum
        kind="hero"
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <LinearGradient
        colors={["rgba(14,15,14,0.5)", "rgba(14,15,14,0.88)", "rgba(14,15,14,0.97)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <View style={{ padding: 22, gap: 18 }}>
        <View
          style={{
            alignSelf: "center",
            width: 176,
            maxWidth: "56%",
            aspectRatio: 2 / 3,
            borderRadius: 20,
            overflow: "hidden",
            backgroundColor: colors.graphite,
            ...shadow.poster,
          }}
        >
          <HookPreview
            hookKey={film.hook_key}
            posterKey={film.poster_key}
            title={film.title}
            aspect={2 / 3}
          />
        </View>
        <View style={{ gap: 11 }}>
          <Text
            style={{
              fontFamily: fonts.monoItalic,
              fontSize: 11,
              letterSpacing: 2.2,
              textTransform: "uppercase",
              color: colors.orange,
            }}
          >
            {kicker}
          </Text>
          <Pressable accessibilityRole="link" onPress={open} onPressIn={() => haptic()}>
            <Text
              numberOfLines={2}
              style={{
                color: colors.text,
                fontFamily: fonts.extraBold,
                fontSize: 36,
                letterSpacing: -1.3,
                lineHeight: 37,
                textTransform: "uppercase",
              }}
            >
              {film.title}
            </Text>
          </Pressable>
          {by ? (
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 14 }}>
              {by}
            </Text>
          ) : null}
          {film.synopsis ? (
            <Text
              numberOfLines={3}
              style={{ color: colors.textSoft, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 }}
            >
              {film.synopsis}
            </Text>
          ) : null}
          {sub ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              {[film.genres[0], duration(film.duration_seconds)]
                .filter((x): x is string => Boolean(x))
                .map((tag) => (
                  <View
                    key={tag}
                    style={{
                      minHeight: 31,
                      paddingHorizontal: 13,
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: "rgba(243,239,233,0.18)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: colors.chead, fontFamily: fonts.semibold, fontSize: 12 }}>
                      {tag}
                    </Text>
                  </View>
                ))}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: 9, marginTop: 4 }}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Play ${film.title}`}
              onPress={play}
              onPressIn={() => haptic("medium")}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <LinearGradient
                colors={gradients.filmPlay}
                locations={gradients.filmPlayLocations}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{
                  minHeight: 48,
                  paddingHorizontal: 22,
                  borderRadius: radius.pill,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                }}
              >
                <IconPlay size={13} color="#fff" />
                <Text style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 14 }}>Play</Text>
              </LinearGradient>
            </Pressable>
            <Button title="Details" size="md" variant="filmDetails" onPress={open} />
          </View>
        </View>
      </View>
    </View>
  );
}

export function PersonRow({
  person,
}: {
  person: {
    id: string;
    handle: string;
    full_name: string;
    roles?: string[];
    location_city?: string | null;
    profile_pic_key?: string | null;
  };
}) {
  return (
      <Pressable
        accessibilityRole="link"
        onPress={() => {
          haptic();
          router.push({ pathname: "/u/[handle]", params: { handle: person.handle } });
        }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          padding: 14,
          borderRadius: radius.cardSm,
          backgroundColor: pressed ? colors.graphiteRaised : colors.graphite,
        })}
      >
        <Avatar picKey={person.profile_pic_key} name={person.full_name} size={52} />
        <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}>
            {person.full_name}
          </Text>
          <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }}>
            {[
              person.roles?.slice(0, 2).map(personRole).filter(Boolean).join(" · "),
              person.location_city,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      </Pressable>
  );
}
