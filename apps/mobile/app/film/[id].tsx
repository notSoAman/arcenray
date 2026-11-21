import { useCallback, useMemo, useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { uuidSchema } from "@repo/shared";
import { useSession } from "../../src/session";
import {
  filmDetail,
  toggleFilm,
  report,
  duration,
  filmColumns,
  personRole,
  withCreators,
  type Film,
} from "../../src/data";
import { FilmPlayer } from "../../src/player";
import { Avatar } from "../../src/visuals";
import { WideCard } from "../../src/cards";
import { IconBookmark, IconHeart, IconShare, IconFlag } from "../../src/icons";
import {
  DetailScreen,
  Kicker,
  Muted,
  SectionTitle,
  Tag,
  Notice,
  Button,
  Field,
  Sheet,
  useResource,
  useAction,
  haptic,
  IconButton,
} from "../../src/ui";
import { colors, fonts, radius } from "../../src/theme";

type CreditRow = {
  id: string;
  display_name: string;
  role: string;
  profile_id: string | null;
};

type CreatorRow = {
  id: string;
  handle: string;
  full_name: string;
  roles: string[];
  location_city: string | null;
  profile_pic_key: string | null;
};

function ActionChip({
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
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: radius.chip,
        borderWidth: 1,
        borderColor: on ? "rgba(232, 82, 122, 0.55)" : colors.lineStrong,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon}
      <Text
        style={{
          color: on ? colors.pink : colors.bone,
          fontFamily: fonts.semibold,
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function FilmScreen() {
  const { id: raw, play } = useLocalSearchParams<{
    id: string;
    play?: string;
  }>();
  const key = useMemo(() => {
    const parsed = uuidSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }, [raw]);
  const { api, me } = useSession();
  const [reason, setReason] = useState("");
  const [reported, setReported] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const a = useAction();
  const [likedState, setLikedState] = useState<boolean | null>(null);
  const [savedState, setSavedState] = useState<boolean | null>(null);
  const [followingState, setFollowingState] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!api || !key) return null;
    const film = await filmDetail(api, key);
    if (!film) return null;
    const [creator, credits, likes, saves, following, filmCount, related] =
      await Promise.all([
        api.supabase
          .from("profiles")
          .select("id,handle,full_name,roles,location_city,profile_pic_key")
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
        me && me.id !== film.owner_id
          ? api.supabase
              .from("profile_follows")
              .select("following_id")
              .eq("follower_id", me.id)
              .eq("following_id", film.owner_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        api.supabase
          .from("films")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", film.owner_id)
          .eq("status", "published"),
        film.genres[0]
          ? api.supabase
              .from("films")
              .select(filmColumns)
              .eq("status", "published")
              .neq("id", key)
              .contains("genres", [film.genres[0]])
              .order("published_at", { ascending: false })
              .limit(4)
          : api.supabase
              .from("films")
              .select(filmColumns)
              .eq("status", "published")
              .neq("id", key)
              .order("published_at", { ascending: false })
              .limit(4),
      ]);
    const creditRows = (credits.data ?? []) as CreditRow[];
    const creditIds = creditRows
      .map((c) => c.profile_id)
      .filter((p): p is string => Boolean(p));
    const creditProfiles = creditIds.length
      ? await api.supabase
          .from("profiles")
          .select("id,handle,full_name,profile_pic_key")
          .in("id", creditIds)
      : {
          data: [] as {
            id: string;
            handle: string;
            full_name: string;
            profile_pic_key: string | null;
          }[],
        };
    return {
      film,
      creator: (creator.data ?? null) as CreatorRow | null,
      credits: creditRows,
      creditProfiles: new Map(
        (creditProfiles.data ?? []).map((p) => [p.id, p]),
      ),
      liked: !!likes.data,
      saved: !!saves.data,
      following: !!following.data,
      filmCount: filmCount.count ?? 0,
      related: await withCreators(api, (related.data ?? []) as Film[]),
    };
  }, [api, key, me]);
  const r = useResource(load);
  const d = r.data;
  const likedOn = likedState ?? d?.liked ?? false;
  const savedOn = savedState ?? d?.saved ?? false;
  const followingOn = followingState ?? d?.following ?? false;

  function act(fn: () => Promise<void>) {
    if (!me) {
      router.push("/sign-in");
      return;
    }
    void a.run(fn);
  }

  const published = d?.film.published_at
    ? new Date(d.film.published_at).toLocaleDateString("en-IN", {
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <DetailScreen
      title="Film"
      right={
        d ? (
          <IconButton
            label="Share film"
            onPress={() =>
              void Share.share({
                message: `${d.film.title} — https://arcenray.com/films/${d.film.id}`,
              })
            }
            icon={<IconShare size={17} color={colors.bone} />}
          />
        ) : undefined
      }
    >
      {r.loading ? (
        <View style={{ gap: 16 }}>
          <View
            style={{
              aspectRatio: 16 / 9,
              borderRadius: 22,
              backgroundColor: colors.graphite,
            }}
          />
          <View
            style={{
              height: 42,
              width: "70%",
              borderRadius: 12,
              backgroundColor: colors.graphite,
            }}
          />
        </View>
      ) : null}
      <Notice message={r.error} retry={r.reload} />

      {d ? (
        <>
          <View style={{ borderRadius: 18, overflow: "hidden" }}>
            <FilmPlayer film={d.film} autoPlay={play === "1"} />
          </View>

          <View style={{ gap: 11 }}>
            <Kicker color={colors.orange}>
              Short film{d.film.genres[0] ? ` · ${d.film.genres[0]}` : ""}
              {d.film.status !== "published" ? " · Draft" : ""}
            </Kicker>
            <Text
              style={{
                color: colors.text,
                fontFamily: fonts.extraBold,
                fontSize: 36,
                letterSpacing: -1.2,
                lineHeight: 40,
              }}
            >
              {d.film.title}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              {duration(d.film.duration_seconds) ? (
                <Tag label={duration(d.film.duration_seconds)} />
              ) : null}
              {d.film.language ? <Tag label={d.film.language} /> : null}
              {d.film.location_city ? (
                <Tag tone="place" label={`Shot in ${d.film.location_city}`} />
              ) : null}
              {published ? <Tag label={published} /> : null}
            </View>
          </View>

          {d.creator ? (
            <View
              style={{
                borderRadius: radius.card,
                backgroundColor: colors.graphite,
                padding: 16,
                gap: 14,
              }}
            >
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
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontFamily: fonts.extraBold,
                      fontSize: 16,
                    }}
                  >
                    {d.creator.full_name}
                  </Text>
                  <Text
                    style={{
                      color: colors.muted,
                      fontFamily: fonts.regular,
                      fontSize: 13,
                    }}
                  >
                    {[
                      d.creator.roles
                        .map(personRole)
                        .filter(Boolean)
                        .slice(0, 2)
                        .join("-"),
                      d.creator.location_city,
                      `${d.filmCount} film${d.filmCount === 1 ? "" : "s"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
              </Pressable>
              {me?.id === d.film.owner_id ? (
                <Button
                  title="Manage film"
                  variant="ghost"
                  size="md"
                  onPress={() =>
                    router.push({
                      pathname: "/publish",
                      params: { draft: d.film.id },
                    })
                  }
                />
              ) : (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Message"
                      variant="accent"
                      size="md"
                      block
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
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      title={followingOn ? "Following" : "Follow"}
                      variant="ghost"
                      size="md"
                      block
                      disabled={a.busy}
                      onPress={() =>
                        act(async () => {
                          const x = followingOn
                            ? await api!.supabase
                                .from("profile_follows")
                                .delete()
                                .eq("follower_id", me!.id)
                                .eq("following_id", d.film.owner_id)
                            : await api!.supabase
                                .from("profile_follows")
                                .insert({
                                  follower_id: me!.id,
                                  following_id: d.film.owner_id,
                                });
                          if (x.error) throw x.error;
                          setFollowingState(!followingOn);
                        })
                      }
                    />
                  </View>
                </View>
              )}
            </View>
          ) : null}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <ActionChip
              label={likedOn ? "Liked" : "Like"}
              on={likedOn}
              icon={
                <IconHeart
                  size={17}
                  color={likedOn ? colors.pink : colors.bone}
                  filled={likedOn}
                />
              }
              onPress={() =>
                act(async () => {
                  const next = !likedOn;
                  await toggleFilm(
                    api!,
                    me!.id,
                    d.film.id,
                    "film_likes",
                    likedOn,
                  );
                  setLikedState(next);
                  if (next)
                    void Promise.resolve(
                      api!.events.record({
                        film_id: d.film.id,
                        kind: "like",
                        idempotency_key: Crypto.randomUUID(),
                        watch_seconds: 0,
                      }),
                    ).catch(() => {});
                })
              }
            />
            <ActionChip
              label={savedOn ? "Saved" : "Save"}
              on={savedOn}
              icon={
                <IconBookmark
                  size={17}
                  color={savedOn ? colors.pink : colors.bone}
                  filled={savedOn}
                />
              }
              onPress={() =>
                act(async () => {
                  const next = !savedOn;
                  await toggleFilm(
                    api!,
                    me!.id,
                    d.film.id,
                    "film_bookmarks",
                    savedOn,
                  );
                  setSavedState(next);
                  if (next)
                    void Promise.resolve(
                      api!.events.record({
                        film_id: d.film.id,
                        kind: "bookmark",
                        idempotency_key: Crypto.randomUUID(),
                        watch_seconds: 0,
                      }),
                    ).catch(() => {});
                })
              }
            />
          </View>

          {d.film.synopsis ? (
            <Text
              style={{
                color: colors.textSoft,
                fontFamily: fonts.regular,
                fontSize: 16,
                lineHeight: 26,
              }}
            >
              {d.film.synopsis}
            </Text>
          ) : null}

          {d.film.mood_tags.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              {d.film.mood_tags.map((m) => (
                <Tag key={m} tone="mood" label={m} />
              ))}
            </View>
          ) : null}

          <View style={{ gap: 16 }}>
            <SectionTitle>People behind the work</SectionTitle>
            {d.credits.length ? (
              <View style={{ gap: 10 }}>
                {d.credits.map((c) => {
                  const p = c.profile_id
                    ? d.creditProfiles.get(c.profile_id)
                    : undefined;
                  const body = (
                    <>
                      <Avatar
                        picKey={p?.profile_pic_key}
                        name={p?.full_name ?? c.display_name}
                        size={46}
                      />
                      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                        <Text
                          style={{
                            color: colors.text,
                            fontFamily: fonts.bold,
                            fontSize: 15,
                          }}
                        >
                          {p?.full_name ?? c.display_name}
                        </Text>
                        <Text
                          style={{
                            color: colors.muted,
                            fontFamily: fonts.regular,
                            fontSize: 13,
                          }}
                        >
                          {c.role}
                        </Text>
                      </View>
                    </>
                  );
                  return p ? (
                    <Pressable
                      key={c.id}
                      accessibilityRole="link"
                      onPress={() =>
                        router.push({
                          pathname: "/u/[handle]",
                          params: { handle: p.handle },
                        })
                      }
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        padding: 12,
                        borderRadius: radius.cardSm,
                        backgroundColor: pressed
                          ? colors.graphiteRaised
                          : colors.graphite,
                      })}
                    >
                      {body}
                    </Pressable>
                  ) : (
                    <View
                      key={c.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        padding: 12,
                        borderRadius: radius.cardSm,
                        backgroundColor: colors.graphite,
                      }}
                    >
                      {body}
                    </View>
                  );
                })}
              </View>
            ) : (
              <Muted>No credits listed yet.</Muted>
            )}
          </View>

          {d.related.length > 0 ? (
            <View style={{ gap: 16 }}>
              <SectionTitle>Related films</SectionTitle>
              <View style={{ gap: 18 }}>
                {d.related.map((f) => (
                  <WideCard
                    key={f.id}
                    film={f}
                    note={
                      d.film.genres[0] && f.genres.includes(d.film.genres[0])
                        ? `also ${d.film.genres[0].toLowerCase()}`
                        : null
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}

          {me?.id !== d.film.owner_id ? (
            reported ? (
              <Muted>Report sent for review.</Muted>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setReportOpen(true)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 44,
                }}
              >
                <IconFlag size={16} color={colors.faint} />
                <Text
                  style={{
                    color: colors.faint,
                    fontFamily: fonts.regular,
                    fontSize: 13,
                  }}
                >
                  Report this film
                </Text>
              </Pressable>
            )
          ) : null}
        </>
      ) : !r.loading && !r.error ? (
        <Muted>This film is unavailable.</Muted>
      ) : null}

      <Sheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report this film"
      >
        <Field
          label="Describe the issue"
          multiline
          value={reason}
          onChangeText={setReason}
          maxLength={1000}
          placeholder="What's wrong with this film?"
        />
        <Button
          title="Send report"
          variant="accent"
          block
          disabled={a.busy || reason.trim().length < 3}
          busy={a.busy}
          onPress={() =>
            act(async () => {
              await report(api!, me!.id, { film_id: d!.film.id }, reason);
              setReason("");
              setReported(true);
              setReportOpen(false);
            })
          }
        />
      </Sheet>
      <Notice message={a.error} />
    </DetailScreen>
  );
}
