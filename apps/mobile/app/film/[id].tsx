import { useCallback, useState } from "react";
import { Share, View, Pressable, Text } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as Crypto from "expo-crypto";
import { uuidSchema } from "@repo/shared";
import { useSession } from "../../src/session";
import { filmDetail, toggleFilm, report, duration } from "../../src/data";
import { FilmPlayer } from "../../src/player";
import { Avatar } from "../../src/visuals";
import { IconHeart, IconBookmark, IconShare } from "../../src/icons";
import {
  Screen,
  Kicker,
  Muted,
  Copy,
  Panel,
  Notice,
  Busy,
  Button,
  Nav,
  Field,
  SectionTitle,
  useResource,
  useAction,
} from "../../src/ui";
import { colors, fonts, radius } from "../../src/theme";

function SocialChip({
  label,
  icon,
  on,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: radius.chip,
        borderWidth: 1,
        borderColor: on ? "rgba(232, 82, 122, 0.55)" : colors.lineStrong,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      {icon}
      <Text
        style={{
          color: on ? colors.pink : colors.bone,
          fontFamily: fonts.semibold,
          fontSize: 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function FilmScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = uuidSchema.safeParse(raw);
  const key = id.success ? id.data : null;
  const { api, me } = useSession();
  const [reason, setReason] = useState("");
  const [reported, setReported] = useState(false);
  const a = useAction();
  const load = useCallback(async () => {
    if (!api || !key) return null;
    const film = await filmDetail(api, key);
    if (!film) return null;
    const [creator, credits, likes, saves] = await Promise.all([
      api.supabase
        .from("profiles")
        .select("handle,full_name,roles,location_city,profile_pic_key")
        .eq("id", film.owner_id)
        .maybeSingle(),
      api.supabase
        .from("film_credits")
        .select("id,display_name,role,profile_id")
        .eq("film_id", key),
      me
        ? api.supabase
            .from("film_likes")
            .select("film_id")
            .eq("film_id", key)
            .eq("user_id", me.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      me
        ? api.supabase
            .from("film_bookmarks")
            .select("film_id")
            .eq("film_id", key)
            .eq("user_id", me.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return {
      film,
      creator: creator.data,
      credits: credits.data ?? [],
      liked: !!likes.data,
      saved: !!saves.data,
    };
  }, [api, key, me]);
  const r = useResource(load);
  const d = r.data;

  function act(fn: () => Promise<void>) {
    if (!me) {
      router.push("/sign-in");
      return;
    }
    void a.run(fn);
  }

  return (
    <Screen>
      {r.loading ? <Busy /> : null}
      <Notice message={r.error} retry={r.reload} />
      {d ? (
        <>
          <View style={{ gap: 10 }}>
            <Kicker color={colors.orange}>
              Short film{d.film.genres[0] ? ` · ${d.film.genres[0]}` : ""}
            </Kicker>
            <Text
              style={{
                color: colors.text,
                fontFamily: fonts.extraBold,
                fontSize: 36,
                letterSpacing: -1.4,
                lineHeight: 40,
              }}
            >
              {d.film.title}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {duration(d.film.duration_seconds) ? (
                <View style={styles.fact}>
                  <Text style={styles.factText}>{duration(d.film.duration_seconds)}</Text>
                </View>
              ) : null}
              {d.film.language ? (
                <View style={styles.fact}>
                  <Text style={styles.factText}>{d.film.language}</Text>
                </View>
              ) : null}
              {d.film.location_city ? (
                <View style={[styles.fact, { borderColor: "rgba(232,82,122,0.4)" }]}>
                  <Text style={[styles.factText, { color: colors.pink }]}>
                    Shot in {d.film.location_city}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <FilmPlayer film={d.film} />

          {d.creator ? (
            <View style={styles.creatorCard}>
              <Pressable
                accessibilityRole="link"
                onPress={() =>
                  router.push({
                    pathname: "/u/[handle]",
                    params: { handle: d.creator!.handle },
                  })
                }
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <Avatar
                  picKey={d.creator.profile_pic_key}
                  name={d.creator.full_name}
                  size={52}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.text, fontFamily: fonts.extraBold, fontSize: 16 }}>
                    {d.creator.full_name}
                  </Text>
                  <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }}>
                    {[
                      d.creator.roles?.slice(0, 2).join(", "),
                      d.creator.location_city,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
              </Pressable>
              {me?.id === d.film.owner_id ? (
                <Nav
                  title="Manage film"
                  href={{ pathname: "/publish", params: { draft: d.film.id } }}
                />
              ) : (
                <Button
                  title="Message"
                  variant="accent"
                  disabled={a.busy}
                  onPress={() =>
                    act(async () => {
                      const c = await api!.chat.open(d.film.owner_id);
                      if (c.error) throw c.error;
                      router.push({
                        pathname: "/chat/[id]",
                        params: { id: c.data },
                      });
                    })
                  }
                />
              )}
            </View>
          ) : null}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <SocialChip
              label={d.liked ? "Liked" : "Like"}
              on={d.liked}
              icon={<IconHeart size={18} color={d.liked ? colors.pink : colors.bone} filled={d.liked} />}
              onPress={() =>
                act(async () => {
                  await toggleFilm(api!, me!.id, d.film.id, "film_likes", d.liked);
                  if (!d.liked)
                    void Promise.resolve(
                      api!.events.record({
                        film_id: d.film.id,
                        kind: "like",
                        idempotency_key: Crypto.randomUUID(),
                        watch_seconds: 0,
                      }),
                    ).catch(() => {});
                  r.reload();
                })
              }
            />
            <SocialChip
              label={d.saved ? "Saved" : "Save"}
              on={d.saved}
              icon={<IconBookmark size={18} color={d.saved ? colors.pink : colors.bone} filled={d.saved} />}
              onPress={() =>
                act(async () => {
                  await toggleFilm(api!, me!.id, d.film.id, "film_bookmarks", d.saved);
                  if (!d.saved)
                    void Promise.resolve(
                      api!.events.record({
                        film_id: d.film.id,
                        kind: "bookmark",
                        idempotency_key: Crypto.randomUUID(),
                        watch_seconds: 0,
                      }),
                    ).catch(() => {});
                  r.reload();
                })
              }
            />
            <SocialChip
              label="Share"
              on={false}
              icon={<IconShare size={18} color={colors.bone} />}
              onPress={() =>
                void Share.share({
                  message: `${d.film.title} — https://arcenray.com/films/${d.film.id}`,
                })
              }
            />
          </View>

          {d.film.synopsis ? (
            <Copy style={{ lineHeight: 26 }}>{d.film.synopsis}</Copy>
          ) : null}

          {d.film.mood_tags.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {d.film.mood_tags.map((m) => (
                <View
                  key={m}
                  style={[styles.fact, { borderColor: "rgba(198,215,155,0.3)" }]}
                >
                  <Text style={[styles.factText, { color: colors.lime }]}>{m}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ gap: 12 }}>
            <SectionTitle>People behind the work</SectionTitle>
            {d.credits.length ? (
              d.credits.map((c) => (
                <Panel key={c.id}>
                  <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 15 }}>
                    {c.display_name}
                  </Text>
                  <Muted>{c.role}</Muted>
                </Panel>
              ))
            ) : (
              <Muted>No credits listed yet.</Muted>
            )}
          </View>

          {reported ? (
            <Copy>Report sent for review.</Copy>
          ) : (
            <View style={{ gap: 12 }}>
              <SectionTitle>Report this film</SectionTitle>
              <Field
                label="Describe the issue"
                multiline
                value={reason}
                onChangeText={setReason}
                maxLength={1000}
              />
              <Button
                title="Send report"
                variant="ghost"
                disabled={a.busy || reason.trim().length < 3}
                onPress={() =>
                  act(async () => {
                    await report(api!, me!.id, { film_id: d.film.id }, reason);
                    setReported(true);
                  })
                }
              />
            </View>
          )}
        </>
      ) : !r.loading && !r.error ? (
        <Muted>This film is unavailable.</Muted>
      ) : null}
      <Notice message={a.error} />
    </Screen>
  );
}

const styles = {
  fact: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radius.tag,
    borderWidth: 1,
    borderColor: colors.line,
  },
  factText: {
    color: colors.textSoft,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  creatorCard: {
    borderRadius: radius.card,
    backgroundColor: colors.graphite,
    padding: 16,
    gap: 14,
  },
};
