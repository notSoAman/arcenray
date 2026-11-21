import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { openCollaboratorConversation } from "@repo/shared";
import { useSession } from "../../src/session";
import {
  filmColumns,
  profileColumns,
  personRole,
  report,
  type Film,
} from "../../src/data";
import { WideCard } from "../../src/cards";
import { Avatar, Spectrum } from "../../src/visuals";
import { IconFlag, IconPin } from "../../src/icons";
import {
  DetailScreen,
  SectionTitle,
  Muted,
  Button,
  Notice,
  Field,
  Sheet,
  ScopeTabs,
  Tag,
  haptic,
  useResource,
  useAction,
} from "../../src/ui";
import { colors, fonts, radius } from "../../src/theme";

type Tab = "films" | "credits" | "about";

type Profile = {
  id: string;
  handle: string;
  full_name: string;
  bio: string | null;
  roles: string[];
  location_city: string | null;
  skills_gear: string[];
  profile_pic_key: string | null;
};

type Credit = { id: string; film_id: string; role: string };

type Person = {
  id: string;
  handle: string;
  full_name: string;
  profile_pic_key: string | null;
};

export default function Profile() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { api, me, signedIn, pending } = useSession();
  const [tab, setTab] = useState<Tab>("films");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockedState, setBlockedState] = useState<boolean | null>(null);
  const a = useAction();
  const contact = useAction();

  const load = useCallback(async () => {
    if (!api || !/^[a-z0-9_]{3,32}$/.test(handle ?? "")) return null;
    const p = await api.supabase
      .from("profiles")
      .select(profileColumns)
      .eq("handle", handle)
      .maybeSingle();
    if (p.error) throw p.error;
    if (!p.data) return null;
    const profile = p.data as Profile;
    const isSelf = profile.id === me?.id;
    const [films, following, blocked, credits, official] = await Promise.all([
      api.supabase
        .from("films")
        .select(filmColumns)
        .eq("owner_id", profile.id)
        .order("published_at", { ascending: false, nullsFirst: true })
        .limit(50),
      me && !isSelf
        ? api.supabase
            .from("profile_follows")
            .select("following_id")
            .eq("follower_id", me.id)
            .eq("following_id", profile.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      me && !isSelf
        ? api.supabase
            .from("user_blocks")
            .select("blocked_id")
            .eq("blocker_id", me.id)
            .eq("blocked_id", profile.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      api.supabase
        .from("film_credits")
        .select("id,film_id,role")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(50),
      profile.handle === "arcenray"
        ? api.supabase.from("profiles").select("is_official").eq("id", profile.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (films.error || credits.error) throw films.error ?? credits.error;
    const visibleFilms = ((films.data ?? []) as Film[]).filter(
      (f) => isSelf || f.status === "published",
    );
    const creditRows = (credits.data ?? []) as Credit[];

    const creditFilmIds = [...new Set(creditRows.map((c) => c.film_id))];
    const creditFilms = creditFilmIds.length
      ? await api.supabase
          .from("films")
          .select("id,title,owner_id,published_at")
          .in("id", creditFilmIds)
      : {
          data: [] as {
            id: string;
            title: string;
            owner_id: string;
            published_at: string | null;
          }[],
        };
    if ("error" in creditFilms && creditFilms.error) throw creditFilms.error;
    const visibleCreditFilms = creditFilms.data ?? [];
    const visibleCreditFilmIds = new Set(visibleCreditFilms.map((f) => f.id));

    const ownFilmIds = visibleFilms.map((f) => f.id);
    const teamCredits = ownFilmIds.length
      ? await api.supabase
          .from("film_credits")
          .select("profile_id")
          .in("film_id", ownFilmIds)
      : { data: [] as { profile_id: string | null }[] };
    const collaboratorIds = [
      ...((teamCredits.data ?? []) as { profile_id: string | null }[]).map(
        (c) => c.profile_id,
      ),
      ...(creditFilms.data ?? []).map((f) => f.owner_id),
    ].filter((id): id is string => Boolean(id) && id !== profile.id);
    const collaborators = collaboratorIds.length
      ? await api.supabase
          .from("profiles")
          .select("id,handle,full_name,profile_pic_key")
          .in("id", [...new Set(collaboratorIds)])
      : { data: [] as Person[] };

    return {
      profile,
      isSelf,
      isOfficial: official.data?.is_official === true,
      films: visibleFilms,
      following: !!following.data,
      blocked: !!blocked.data,
      credits: isSelf
        ? creditRows
        : creditRows.filter((c) => visibleCreditFilmIds.has(c.film_id)),
      creditFilms: new Map((creditFilms.data ?? []).map((f) => [f.id, f])),
      collaborators: (collaborators.data ?? []) as Person[],
    };
  }, [api, handle, me]);
  const r = useResource(load);
  const d = r.data;
  const blockedOn = blockedState ?? d?.blocked ?? false;

  function act(fn: () => Promise<void>) {
    if (!me) {
      router.push("/sign-in");
      return;
    }
    void a.run(fn);
  }

  const roles = d?.profile.roles.map(personRole).filter(Boolean).join(" · ");

  return (
    <DetailScreen
      title={d ? d.profile.full_name || `@${d.profile.handle}` : "Creative"}
    >
      {r.loading ? (
        <View style={{ gap: 16 }}>
          <View
            style={{
              height: 150,
              borderRadius: 20,
              backgroundColor: colors.graphite,
            }}
          />
          <View
            style={{
              height: 30,
              width: "60%",
              borderRadius: 10,
              backgroundColor: colors.graphite,
            }}
          />
        </View>
      ) : null}
      <Notice message={r.error} retry={r.reload} />

      {d ? (
        <>
          <View
            style={{
              borderRadius: radius.card,
              overflow: "hidden",
              marginHorizontal: -20,
            }}
          >
            <View style={{ height: 150 }}>
              <Spectrum
                kind="hero"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                }}
              />
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  backgroundColor: "rgba(14,15,14,0.35)",
                }}
              />
            </View>
            <View
              style={{
                backgroundColor: colors.graphite,
                paddingHorizontal: 20,
                paddingBottom: 20,
                paddingTop: 0,
                marginTop: -50,
                gap: 12,
              }}
            >
              <Avatar
                picKey={d.profile.profile_pic_key}
                name={d.profile.full_name || d.profile.handle}
                size={104}
                style={{ borderWidth: 4, borderColor: colors.graphite }}
              />
              <View style={{ gap: 5 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontFamily: fonts.extraBold,
                    fontSize: 34,
                    lineHeight: 36,
                    letterSpacing: -1.3,
                  }}
                >
                  {d.profile.full_name || `@${d.profile.handle}`}
                </Text>
                <Text
                  style={{
                    color: colors.faint,
                    fontFamily: fonts.regular,
                    fontSize: 14,
                  }}
                >
                  @{d.profile.handle}
                </Text>
                {d.isOfficial ? (
                  <Text style={{ color: colors.bone, fontFamily: fonts.bold, fontSize: 13 }}>
                    Official Arcenray account
                  </Text>
                ) : null}
                {roles ? (
                  <Text
                    style={{
                      color: colors.chead,
                      fontFamily: fonts.regular,
                      fontSize: 15,
                    }}
                  >
                    {roles}
                  </Text>
                ) : null}
                {d.profile.location_city ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <IconPin size={15} color={colors.muted} />
                    <Text
                      style={{
                        color: colors.muted,
                        fontFamily: fonts.regular,
                        fontSize: 14,
                      }}
                    >
                      {d.profile.location_city}
                    </Text>
                  </View>
                ) : null}
              </View>

              {d.isSelf ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Publish a film"
                      variant="accent"
                      size="md"
                      block
                      onPress={() => router.push("/publish")}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Edit profile"
                      variant="ghost"
                      size="md"
                      block
                      onPress={() => router.push("/onboarding")}
                    />
                  </View>
                </View>
              ) : blockedOn ? (
                <Button
                  title="Unblock"
                  variant="ghost"
                  size="md"
                  disabled={a.busy}
                  onPress={() =>
                    act(async () => {
                      const x = await api!.supabase
                        .from("user_blocks")
                        .delete()
                        .eq("blocker_id", me!.id)
                        .eq("blocked_id", d.profile.id);
                      if (x.error) throw x.error;
                      setBlockedState(false);
                      setNotice("Unblocked.");
                    })
                  }
                />
              ) : (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title={!signedIn ? "Sign in to message" : "Message"}
                      variant="accent"
                      size="md"
                      block
                      disabled={a.busy || pending}
                      busy={contact.busy}
                      onPress={() =>
                        void contact.run(async () => {
                          if (!api)
                            throw new Error("Conversation unavailable.");
                          const result = await openCollaboratorConversation(
                            api,
                            d.profile.id,
                          );
                          if (result.status === "sign-in") {
                            router.push("/sign-in");
                            return;
                          }
                          router.push({
                            pathname: "/chat/[id]",
                            params: { id: result.conversationId },
                          });
                        })
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      title={d.following ? "Following" : "Follow"}
                      variant="ghost"
                      size="md"
                      block
                      disabled={a.busy}
                      onPress={() =>
                        act(async () => {
                          const x = d.following
                            ? await api!.supabase
                                .from("profile_follows")
                                .delete()
                                .eq("follower_id", me!.id)
                                .eq("following_id", d.profile.id)
                            : await api!.supabase
                                .from("profile_follows")
                                .insert({
                                  follower_id: me!.id,
                                  following_id: d.profile.id,
                                });
                          if (x.error) throw x.error;
                          r.reload();
                        })
                      }
                    />
                  </View>
                </View>
              )}
            </View>
          </View>

          {!d.isSelf && !blockedOn ? (
            <View style={{ gap: 10 }}>
              <SectionTitle size={23}>Start with their work.</SectionTitle>
              <Muted>
                Explore their films and filmmaker-listed credits, then use
                Message to introduce your project, the craft you need, and why
                their work fits.
                {me
                  ? " Messages stay private between the two of you."
                  : " Sign in to message this creative."}
              </Muted>
            </View>
          ) : null}

          <Notice message={contact.error} />

          <ScopeTabs
            items={[
              { key: "films", label: "Films" },
              { key: "credits", label: "Credits" },
              { key: "about", label: "About" },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === "films" ? (
            d.films.length ? (
              <View style={{ gap: 18 }}>
                {d.films.map((f) => (
                  <WideCard
                    key={f.id}
                    film={f}
                    note={[
                      f.status !== "published" ? "Draft" : null,
                      f.published_at
                        ? new Date(f.published_at).getFullYear().toString()
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                ))}
              </View>
            ) : (
              <View
                style={{
                  gap: 10,
                  padding: 24,
                  borderRadius: radius.card,
                  backgroundColor: colors.plum,
                }}
              >
                <SectionTitle size={23}>
                  {d.isSelf
                    ? "You haven't published a film yet"
                    : "No films yet"}
                </SectionTitle>
                <Text
                  style={{
                    color: colors.textSoft,
                    fontFamily: fonts.regular,
                    fontSize: 15,
                    lineHeight: 23,
                  }}
                >
                  {d.isSelf
                    ? "Use Publish a film to save a draft and share your work. Your films will show here."
                    : "No published films here yet. Explore Credits for work they contributed to, or About for their skills."}
                </Text>
                {d.isSelf ? (
                  <Button
                    title="Publish a film"
                    onPress={() => router.push("/publish")}
                  />
                ) : null}
              </View>
            )
          ) : null}

          {tab === "credits" ? (
            d.credits.length ? (
              <View>
                {d.credits.map((c) => {
                  const f = d.creditFilms.get(c.film_id);
                  const body = (
                    <>
                      <Text
                        style={{
                          flex: 1,
                          color: colors.text,
                          fontFamily: fonts.bold,
                          fontSize: 16,
                        }}
                      >
                        {f?.title ?? "A film not yet public"}
                      </Text>
                      <Text
                        style={{
                          color: colors.muted,
                          fontFamily: fonts.regular,
                          fontSize: 13,
                        }}
                      >
                        {c.role}
                        {f?.published_at
                          ? ` · ${new Date(f.published_at).getFullYear()}`
                          : ""}
                      </Text>
                    </>
                  );
                  return f ? (
                    <Pressable
                      key={c.id}
                      accessibilityRole="link"
                      onPress={() =>
                        router.push({
                          pathname: "/film/[id]",
                          params: { id: f.id },
                        })
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 14,
                        paddingVertical: 16,
                        borderBottomWidth: 1,
                        borderBottomColor: "rgba(243,239,233,0.08)",
                      }}
                    >
                      {body}
                    </Pressable>
                  ) : (
                    <View
                      key={c.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 14,
                        paddingVertical: 16,
                        borderBottomWidth: 1,
                        borderBottomColor: "rgba(243,239,233,0.08)",
                      }}
                    >
                      {body}
                    </View>
                  );
                })}
              </View>
            ) : (
              <Muted>No film credits yet.</Muted>
            )
          ) : null}

          {tab === "about" ? (
            <View style={{ gap: 22 }}>
              {d.profile.bio ? (
                <Text
                  style={{
                    color: colors.text,
                    fontFamily: fonts.medium,
                    fontSize: 18,
                    lineHeight: 27,
                  }}
                >
                  {d.profile.bio}
                </Text>
              ) : (
                <Muted>
                  {d.isSelf ? "Add a bio in Settings." : "No bio yet."}
                </Muted>
              )}
              {d.profile.skills_gear.length > 0 ? (
                <View style={{ gap: 12 }}>
                  <SectionTitle size={20}>Skills &amp; tools</SectionTitle>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {d.profile.skills_gear.map((s) => (
                      <Tag key={s} label={s} />
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {d.collaborators.length > 0 ? (
            <View style={{ gap: 14 }}>
              <SectionTitle size={20}>Made with</SectionTitle>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
                {d.collaborators.map((m) => (
                  <Pressable
                    key={m.id}
                    accessibilityRole="link"
                    onPress={() =>
                      router.push({
                        pathname: "/u/[handle]",
                        params: { handle: m.handle },
                      })
                    }
                    style={{ width: 66, alignItems: "center", gap: 6 }}
                  >
                    <Avatar
                      picKey={m.profile_pic_key}
                      name={m.full_name}
                      size={56}
                    />
                    <Text
                      numberOfLines={1}
                      style={{
                        color: colors.chead,
                        fontFamily: fonts.regular,
                        fontSize: 12,
                        textAlign: "center",
                      }}
                    >
                      {m.full_name.split(/\s+/)[0]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {d.profile.bio && tab !== "about" ? (
            <View style={{ gap: 10 }}>
              <SectionTitle size={20}>About</SectionTitle>
              <Text
                numberOfLines={6}
                style={{
                  color: colors.textSoft,
                  fontFamily: fonts.regular,
                  fontSize: 15,
                  lineHeight: 24,
                }}
              >
                {d.profile.bio}
              </Text>
            </View>
          ) : null}

          {!d.isSelf ? (
            <View
              style={{
                flexDirection: "row",
                gap: 18,
                alignItems: "center",
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: colors.line,
              }}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => setReportOpen(true)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                  minHeight: 44,
                }}
              >
                <IconFlag size={15} color={colors.faint} />
                <Text
                  style={{
                    color: colors.faint,
                    fontFamily: fonts.regular,
                    fontSize: 13,
                  }}
                >
                  Report
                </Text>
              </Pressable>
              {!blockedOn ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    haptic("warning");
                    setBlockOpen(true);
                  }}
                  style={{ minHeight: 44, justifyContent: "center" }}
                >
                  <Text
                    style={{
                      color: colors.faint,
                      fontFamily: fonts.regular,
                      fontSize: 13,
                    }}
                  >
                    Block
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </>
      ) : !r.loading && !r.error ? (
        <Muted>This creative is unavailable.</Muted>
      ) : null}

      {notice ? <Muted style={{ color: colors.lime }}>{notice}</Muted> : null}
      <Notice message={a.error} />

      <Sheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report this creative"
      >
        <Field
          label="Describe the issue"
          value={reason}
          onChangeText={setReason}
          multiline
          placeholder="What's wrong with this profile?"
        />
        <Button
          title="Send report"
          variant="accent"
          block
          disabled={a.busy || reason.trim().length < 3}
          busy={a.busy}
          onPress={() =>
            act(async () => {
              await report(api!, me!.id, { profile_id: d!.profile.id }, reason);
              setReason("");
              setReportOpen(false);
              setNotice("Report sent for review.");
            })
          }
        />
      </Sheet>

      <Sheet
        visible={blockOpen}
        onClose={() => setBlockOpen(false)}
        title={`Block @${d?.profile.handle ?? ""}?`}
      >
        <Text
          style={{
            color: colors.textSoft,
            fontFamily: fonts.regular,
            fontSize: 15,
            lineHeight: 23,
          }}
        >
          You won't see their films or profile, and they can't message you.
        </Text>
        <Button
          title="Block"
          variant="accent"
          block
          busy={a.busy}
          onPress={() =>
            act(async () => {
              const x = await api!.supabase.from("user_blocks").insert({
                blocker_id: me!.id,
                blocked_id: d!.profile.id,
              });
              if (x.error) throw x.error;
              setBlockedState(true);
              setBlockOpen(false);
              setNotice("Blocked.");
            })
          }
        />
        <Button
          title="Cancel"
          variant="ghost"
          block
          onPress={() => setBlockOpen(false)}
        />
      </Sheet>
    </DetailScreen>
  );
}
