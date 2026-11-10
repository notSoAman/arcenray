import { Pressable, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Poster, Avatar, Spectrum } from "./visuals";
import { colors, fonts, radius } from "./theme";
import { duration, byline, type Film } from "./data";

function Badge({ label }: { label: string }) {
  return (
    <View
      style={{
        position: "absolute",
        right: 10,
        bottom: 10,
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 10,
        backgroundColor: "rgba(14, 15, 14, 0.8)",
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
    <Link href={{ pathname: "/film/[id]", params: { id: film.id } }} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Watch ${film.title}`}
        style={{ gap: 10, flex: 1, minWidth: 0 }}
      >
        <View>
          <Poster posterKey={film.poster_key} title={film.title} aspect={2 / 3} />
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
          }}
        >
          {film.title}
        </Text>
        {sub ? (
          <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13, marginTop: -4 }}>
            {sub}
          </Text>
        ) : null}
      </Pressable>
    </Link>
  );
}

/** Landscape card (profile films, related films). */
export function WideCard({ film }: { film: Film }) {
  const sub = byline(film) ?? meta(film);
  return (
    <Link href={{ pathname: "/film/[id]", params: { id: film.id } }} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Watch ${film.title}`}
        style={{ gap: 10 }}
      >
        <View>
          <Poster posterKey={film.poster_key} title={film.title} aspect={16 / 9} />
          {duration(film.duration_seconds) ? (
            <Badge label={duration(film.duration_seconds)} />
          ) : null}
        </View>
        <Text
          numberOfLines={1}
          style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}
        >
          {film.title}
        </Text>
        {sub ? (
          <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13, marginTop: -4 }}>
            {sub}
          </Text>
        ) : null}
      </Pressable>
    </Link>
  );
}

/** Search / discovery result row with a small poster. */
export function RowCard({ film }: { film: Film }) {
  const sub = [film.creator?.full_name, film.genres[0], film.location_city]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link href={{ pathname: "/film/[id]", params: { id: film.id } }} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Watch ${film.title}`}
        style={{
          flexDirection: "row",
          gap: 14,
          padding: 12,
          borderRadius: radius.card,
          backgroundColor: colors.graphite,
        }}
      >
        <View style={{ width: 96 }}>
          <Poster posterKey={film.poster_key} title={film.title} aspect={2 / 3} />
        </View>
        <View style={{ flex: 1, gap: 6, paddingVertical: 4 }}>
          <Text
            numberOfLines={2}
            style={{ color: colors.text, fontFamily: fonts.extraBold, fontSize: 18 }}
          >
            {film.title}
          </Text>
          {sub ? (
            <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }}>
              {sub}
            </Text>
          ) : null}
          {film.synopsis ? (
            <Text numberOfLines={2} style={{ color: colors.textSoft, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 }}>
              {film.synopsis}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

/** Cinematic spectrum panel with the poster on a calm surface (W1, W2). */
export function FeaturedFilm({ film, kicker }: { film: Film; kicker: string }) {
  const by = byline(film, { role: true });
  const sub = [film.genres[0], duration(film.duration_seconds)]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={{ borderRadius: radius.panel, overflow: "hidden" }}>
      <Spectrum kind="hero" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
      <LinearGradient
        colors={["rgba(14,15,14,0.55)", "rgba(14,15,14,0.9)", "rgba(14,15,14,0.96)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 20,
          padding: 24,
          alignItems: "center",
        }}
      >
        <View style={{ width: 150 }}>
          <Poster posterKey={film.poster_key} title={film.title} aspect={2 / 3} />
        </View>
        <View style={{ flex: 1, minWidth: 220, gap: 12 }}>
          <Text
            style={{
              fontFamily: fonts.monoItalic,
              fontSize: 11,
              letterSpacing: 2.4,
              textTransform: "uppercase",
              color: colors.orange,
            }}
          >
            {kicker}
          </Text>
          <Text
            numberOfLines={2}
            style={{
              color: colors.text,
              fontFamily: fonts.extraBold,
              fontSize: 30,
              letterSpacing: -1,
              lineHeight: 32,
              textTransform: "uppercase",
            }}
          >
            {film.title}
          </Text>
          {by ? (
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 14 }}>
              {by}
            </Text>
          ) : null}
          {sub ? (
            <Text style={{ color: colors.faint, fontFamily: fonts.regular, fontSize: 13 }}>
              {sub}
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
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Play ${film.title}`}
              onPress={() => router.push({ pathname: "/film/[id]", params: { id: film.id } })}
            >
              <LinearGradient
                colors={[colors.filmPlayStart, colors.filmPlayMid, colors.filmPlayEnd]}
                locations={[0, 0.48, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 20,
                  borderRadius: radius.pill,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                }}
              >
                <Text style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 15 }}>Play</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Details for ${film.title}`}
              onPress={() => router.push({ pathname: "/film/[id]", params: { id: film.id } })}
              style={{
                minHeight: 44,
                paddingHorizontal: 20,
                borderRadius: radius.pill,
                backgroundColor: "#fff",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: colors.void, fontFamily: fonts.bold, fontSize: 15 }}>Details</Text>
            </Pressable>
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
    <Link
      href={{ pathname: "/u/[handle]", params: { handle: person.handle } }}
      asChild
    >
      <Pressable
        accessibilityRole="link"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          padding: 14,
          borderRadius: radius.card,
          backgroundColor: colors.graphite,
        }}
      >
        <Avatar picKey={person.profile_pic_key} name={person.full_name} size={52} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}>
            {person.full_name}
          </Text>
          <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }}>
            {[
              person.roles?.slice(0, 2).join(", "),
              person.location_city,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}
