import { Image, Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { config, publicMediaUrl } from "./config";
import { colors, styles } from "./theme";
import { duration, type Film } from "./data";
import { Copy, Muted } from "./ui";
export function FilmTile({ film }: { film: Film }) {
  const poster = publicMediaUrl(config.mediaOrigin, film.poster_key);
  return (
    <Link href={{ pathname: "/film/[id]", params: { id: film.id } }} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Watch ${film.title}`}
        style={{
          backgroundColor: colors.graphite,
          borderRadius: 24,
          overflow: "hidden",
        }}
      >
        {poster ? (
          <Image
            source={{ uri: poster }}
            accessibilityLabel={`${film.title} poster`}
            resizeMode="cover"
            style={{ aspectRatio: 16 / 10, width: "100%" }}
          />
        ) : null}
        <View style={{ gap: 8, padding: 20 }}>
          <Text style={[styles.title, { fontSize: 24 }]}>{film.title}</Text>
          <Muted>
            {[film.genres.join(" · "), duration(film.duration_seconds)]
              .filter(Boolean)
              .join(" · ")}
          </Muted>
          <Text numberOfLines={3} style={styles.body}>
            {film.synopsis}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}
export function PeopleTile({
  person,
}: {
  person: {
    handle: string;
    full_name: string;
    roles?: string[];
    location_city?: string | null;
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
          gap: 8,
          padding: 20,
          borderRadius: 24,
          backgroundColor: colors.graphite,
        }}
      >
        <Copy>{person.full_name}</Copy>
        <Muted>
          @{person.handle} ·{" "}
          {[person.roles?.join(", "), person.location_city]
            .filter(Boolean)
            .join(" · ")}
        </Muted>
      </Pressable>
    </Link>
  );
}
