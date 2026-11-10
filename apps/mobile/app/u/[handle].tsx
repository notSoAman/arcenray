import { useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSession } from "../../src/session";
import { filmColumns, profileColumns, report } from "../../src/data";
import { WideCard } from "../../src/cards";
import { Avatar, Spectrum } from "../../src/visuals";
import { IconPin } from "../../src/icons";
import {
  Screen,
  PageTitle,
  SectionTitle,
  Copy,
  Muted,
  Nav,
  Button,
  Notice,
  Busy,
  Field,
  Pill,
  useResource,
  useAction,
} from "../../src/ui";
import { colors, fonts, radius } from "../../src/theme";

type Tab = "films" | "credits" | "about";

export default function Profile() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { api, me } = useSession();
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<Tab>("films");
  const a = useAction();
  const load = useCallback(async () => {
    if (!api || !/^[a-z0-9_]{3,32}$/.test(handle ?? "")) return null;
    const p = await api.supabase
      .from("profiles")
      .select(profileColumns)
      .eq("handle", handle)
      .maybeSingle();
    if (p.error) throw p.error;
    if (!p.data) return null;
    const [films, following, blocked, credits] = await Promise.all([
      api.supabase
        .from("films")
        .select(filmColumns)
        .eq("owner_id", p.data.id)
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(50),
      me
        ? api.supabase
            .from("profile_follows")
            .select("following_id")
            .eq("follower_id", me.id)
            .eq("following_id", p.data.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      me
        ? api.supabase
            .from("user_blocks")
            .select("blocked_id")
            .eq("blocker_id", me.id)
            .eq("blocked_id", p.data.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      api.supabase
        .from("film_credits")
        .select("id,film_id,role")
        .eq("profile_id", p.data.id)
        .limit(50),
    ]);
    if (films.error) throw films.error;
    return {
      profile: p.data,
      films: films.data ?? [],
      following: !!following.data,
      blocked: !!blocked.data,
      credits: credits.data ?? [],
    };
  }, [api, handle, me]);
  const r = useResource(load);
  const d = r.data;
  function act(fn: () => Promise<void>) {
    if (!me) {
      router.push("/sign-in");
      return;
    }
    void a.run(fn);
  }
  const roles = d?.profile.roles?.join(" · ");

  return (
    <Screen>
      {r.loading ? <Busy /> : null}
      <Notice message={r.error} retry={r.reload} />
      {d ? (
        <>
          <View style={{ borderRadius: radius.card, overflow: "hidden" }}>
            <View style={{ height: 120 }}>
              <Spectrum kind="hero" />
            </View>
            <View style={{ backgroundColor: colors.graphite, padding: 20, gap: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 16, marginTop: -52 }}>
                <Avatar
                  picKey={d.profile.profile_pic_key}
                  name={d.profile.full_name || d.profile.handle}
                  size={92}
                  style={{ borderWidth: 4, borderColor: colors.graphite }}
                />
                <View style={{ flex: 1, paddingBottom: 4, gap: 2 }}>
                  <Text style={{ color: colors.text, fontFamily: fonts.extraBold, fontSize: 26, letterSpacing: -0.8 }}>
                    {d.profile.full_name || `@${d.profile.handle}`}
                  </Text>
                  <Text style={{ color: colors.faint, fontFamily: fonts.regular, fontSize: 14 }}>
                    @{d.profile.handle}
                  </Text>
                </View>
              </View>
              {roles ? (
                <Text style={{ color: colors.textSoft, fontFamily: fonts.regular, fontSize: 15 }}>
                  {roles}
                </Text>
              ) : null}
              {d.profile.location_city ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <IconPin size={15} color={colors.muted} />
                  <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 14 }}>
                    {d.profile.location_city}
                  </Text>
                </View>
              ) : null}

              {d.profile.id === me?.id ? (
                <Button title="Edit profile" variant="ghost" onPress={() => router.push("/onboarding")} />
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <Button
                    title="Message"
                    variant="accent"
                    disabled={a.busy}
                    onPress={() =>
                      act(async () => {
                        const c = await api!.chat.open(d.profile.id);
                        if (c.error) throw c.error;
                        router.push({ pathname: "/chat/[id]", params: { id: c.data } });
                      })
                    }
                  />
                  <Button
                    title={d.following ? "Following" : "Follow"}
                    variant="ghost"
                    disabled={a.busy}
                    onPress={() =>
                      act(async () => {
                        const x = d.following
                          ? await api!.supabase
                              .from("profile_follows")
                              .delete()
                              .eq("follower_id", me!.id)
                              .eq("following_id", d.profile.id)
                          : await api!.supabase.from("profile_follows").insert({
                              follower_id: me!.id,
                              following_id: d.profile.id,
                            });
                        if (x.error) throw x.error;
                        r.reload();
                      })
                    }
                  />
                  <Button
                    title={d.blocked ? "Unblock" : "Block"}
                    variant="ghost"
                    disabled={a.busy}
                    onPress={() =>
                      act(async () => {
                        const x = d.blocked
                          ? await api!.supabase
                              .from("user_blocks")
                              .delete()
                              .eq("blocker_id", me!.id)
                              .eq("blocked_id", d.profile.id)
                          : await api!.supabase.from("user_blocks").insert({
                              blocker_id: me!.id,
                              blocked_id: d.profile.id,
                            });
                        if (x.error) throw x.error;
                        setNotice(d.blocked ? "Unblocked." : "Blocked.");
                        r.reload();
                      })
                    }
                  />
                </View>
              )}
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 6 }}>
            {(["films", "credits", "about"] as const).map((t) => (
              <Pill
                key={t}
                label={t === "films" ? "Films" : t === "credits" ? "Credits" : "About"}
                on={tab === t}
                onPress={() => setTab(t)}
              />
            ))}
          </View>

          {tab === "films" ? (
            d.films.length ? (
              <View style={{ gap: 16 }}>
                {d.films.map((f) => (
                  <WideCard key={f.id} film={f} />
                ))}
              </View>
            ) : (
              <Muted>No published films yet.</Muted>
            )
          ) : null}

          {tab === "credits" ? (
            d.credits.length ? (
              <View style={{ gap: 10 }}>
                {d.credits.map((c) => (
                  <Nav
                    key={c.id}
                    title={c.role}
                    href={{ pathname: "/film/[id]", params: { id: c.film_id } }}
                  />
                ))}
              </View>
            ) : (
              <Muted>No film credits yet.</Muted>
            )
          ) : null}

          {tab === "about" ? (
            <View style={{ gap: 16 }}>
              {d.profile.bio ? (
                <Copy>{d.profile.bio}</Copy>
              ) : (
                <Muted>No bio yet.</Muted>
              )}
              {d.profile.skills_gear.length > 0 ? (
                <View style={{ gap: 10 }}>
                  <SectionTitle>Skills &amp; tools</SectionTitle>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {d.profile.skills_gear.map((s) => (
                      <View
                        key={s}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: radius.pill,
                          borderWidth: 1,
                          borderColor: colors.line,
                        }}
                      >
                        <Text style={{ color: colors.textSoft, fontFamily: fonts.regular, fontSize: 14 }}>
                          {s}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {d.profile.id !== me?.id ? (
            <View style={{ gap: 12 }}>
              <SectionTitle>Report this creative</SectionTitle>
              <Field
                label="Describe the issue"
                value={reason}
                onChangeText={setReason}
                multiline
              />
              <Button
                title="Send report"
                variant="ghost"
                disabled={a.busy || reason.trim().length < 3}
                onPress={() =>
                  act(async () => {
                    await report(api!, me!.id, { profile_id: d.profile.id }, reason);
                    setReason("");
                    setNotice("Report sent for review.");
                  })
                }
              />
            </View>
          ) : null}
        </>
      ) : !r.loading && !r.error ? (
        <Muted>This creative is unavailable.</Muted>
      ) : null}
      {notice ? <Copy>{notice}</Copy> : null}
      <Notice message={a.error} />
    </Screen>
  );
}
