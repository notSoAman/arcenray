import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { useSession } from "./session";
import { duration, type Film } from "./data";
import { Poster } from "./visuals";
import { colors, fonts, radius } from "./theme";
import { haptic } from "./ui";

type Choice = "like" | "pass";

/**
 * "Same wavelength / Not my niche" picks (web W1). Likes/skips are real taste
 * events. There is no mutual-match feature, so a like offers to message the
 * maker — matching the web's wording and behaviour.
 */
export function WavelengthPicks({
  films,
  viewerId,
}: {
  films: Film[];
  viewerId: string | null;
}) {
  const { api } = useSession();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const decided = Object.keys(choices).length;
  const liked = Object.values(choices).filter((c) => c === "like").length;

  async function choose(film: Film, choice: Choice) {
    if (!viewerId) {
      router.push("/sign-in");
      return;
    }
    if (!api || busy) return;
    haptic(choice === "like" ? "medium" : "light");
    setFailed(null);
    setChoices((c) => ({ ...c, [film.id]: choice }));
    if (choice === "pass") {
      void Promise.resolve(
        api.events.record({
          film_id: film.id,
          kind: "skip",
          idempotency_key: Crypto.randomUUID(),
          watch_seconds: 0,
        }),
      ).catch(() => {});
      return;
    }
    setBusy(film.id);
    try {
      const { error } = await api.supabase
        .from("film_likes")
        .insert({ user_id: viewerId, film_id: film.id });
      if (error && error.code !== "23505") throw error;
      void Promise.resolve(
        api.events.record({
          film_id: film.id,
          kind: "like",
          idempotency_key: Crypto.randomUUID(),
          watch_seconds: 0,
        }),
      ).catch(() => {});
    } catch {
      setFailed(film.id);
      setChoices((c) => {
        const next = { ...c };
        delete next[film.id];
        return next;
      });
    } finally {
      setBusy(null);
    }
  }

  async function sayHello(film: Film) {
    if (!api || !film.creator || !viewerId) return;
    const c = await api.chat.open(film.creator.id);
    if (c.error) {
      setFailed(film.id);
      return;
    }
    router.push({ pathname: "/chat/[id]", params: { id: c.data } });
  }

  if (!films.length) return null;

  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
        <View style={{ flex: 1, gap: 8 }}>
          <Text
            style={{
              color: colors.pink,
              fontFamily: fonts.monoBold,
              fontSize: 11,
              letterSpacing: 2.2,
              textTransform: "uppercase",
            }}
          >
            Your wavelength · {films.length} picks tonight
          </Text>
          <Text
            style={{
              color: colors.text,
              fontFamily: fonts.extraBold,
              fontSize: 28,
              lineHeight: 31,
              letterSpacing: -0.7,
            }}
          >
            Same wavelength, or not your niche?
          </Text>
        </View>
      </View>
      <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }}>
        {decided === films.length
          ? `That's tonight's picks. ${liked} liked.`
          : `${films.length - decided} left tonight`}
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {films.map((film) => {
          const choice = choices[film.id];
          const first =
            film.creator?.full_name.split(/\s+/)[0] ||
            (film.creator ? `@${film.creator.handle}` : null);
          const meta = [film.genres[0], duration(film.duration_seconds)]
            .filter(Boolean)
            .join(" · ");
          return (
            <View
              key={film.id}
              style={{
                width: "47%",
                flexGrow: 1,
                minWidth: 150,
                borderRadius: radius.card,
                backgroundColor: colors.graphite,
                overflow: "hidden",
                opacity: choice === "pass" ? 0.45 : 1,
              }}
            >
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Open ${film.title}`}
                onPress={() =>
                  router.push({ pathname: "/film/[id]", params: { id: film.id } })
                }
              >
                <View>
                  <Poster posterKey={film.poster_key} title={film.title} aspect={4 / 5} />
                  {meta ? (
                    <View
                      style={{
                        position: "absolute",
                        left: 10,
                        bottom: 10,
                        paddingHorizontal: 9,
                        paddingVertical: 4,
                        borderRadius: 11,
                        backgroundColor: "rgba(14,15,14,0.8)",
                      }}
                    >
                      <Text style={{ color: colors.bone, fontFamily: fonts.semibold, fontSize: 11 }}>
                        {meta}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
              <View style={{ padding: 14, gap: 6, flex: 1 }}>
                <Pressable
                  accessibilityRole="link"
                  onPress={() =>
                    router.push({ pathname: "/film/[id]", params: { id: film.id } })
                  }
                >
                  <Text
                    numberOfLines={2}
                    style={{ color: colors.text, fontFamily: fonts.extraBold, fontSize: 17, letterSpacing: -0.3, lineHeight: 20 }}
                  >
                    {film.title}
                  </Text>
                </Pressable>
                {film.creator ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() =>
                      router.push({
                        pathname: "/u/[handle]",
                        params: { handle: film.creator!.handle },
                      })
                    }
                  >
                    <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12 }}>
                      {film.creator.full_name}
                      {film.location_city ? ` · ${film.location_city}` : ""}
                    </Text>
                  </Pressable>
                ) : null}
                {failed === film.id ? (
                  <Text accessibilityRole="alert" style={{ color: colors.pink, fontFamily: fonts.regular, fontSize: 12 }}>
                    Couldn't save that. Try again.
                  </Text>
                ) : null}
                <View style={{ marginTop: "auto", paddingTop: 10, gap: 7 }}>
                  {!choice ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy === film.id}
                        onPress={() => void choose(film, "pass")}
                        style={({ pressed }) => ({
                          minHeight: 42,
                          borderRadius: 21,
                          borderWidth: 1,
                          borderColor: "rgba(243,239,233,0.18)",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <Text style={{ color: colors.bone, fontFamily: fonts.semibold, fontSize: 12 }}>
                          Not my niche
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy === film.id}
                        onPress={() => void choose(film, "like")}
                        style={({ pressed }) => ({
                          minHeight: 42,
                          borderRadius: 21,
                          backgroundColor: colors.ember,
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: pressed ? 0.8 : 1,
                        })}
                      >
                        <Text style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 12 }}>
                          {busy === film.id ? "Saving…" : "Same wavelength"}
                        </Text>
                      </Pressable>
                    </>
                  ) : choice === "like" ? (
                    film.creator && film.creator.id !== viewerId && first ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void sayHello(film)}
                        style={{ minHeight: 42, justifyContent: "center" }}
                      >
                        <Text style={{ color: colors.lime, fontFamily: fonts.bold, fontSize: 12, lineHeight: 17 }}>
                          Liked · say hello to {first}
                        </Text>
                      </Pressable>
                    ) : (
                      <Text style={{ color: colors.lime, fontFamily: fonts.bold, fontSize: 12 }}>
                        Liked
                      </Text>
                    )
                  ) : (
                    <Text style={{ color: colors.faint, fontFamily: fonts.regular, fontSize: 12 }}>
                      Fewer like this
                    </Text>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
