import { Image } from "react-native";
import { config, publicMediaUrl } from "../../src/config";
import { useCallback, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { useSession } from "../../src/session";
import { filmColumns, profileColumns, report } from "../../src/data";
import { FilmTile } from "../../src/cards";
import {
  Screen,
  Title,
  Copy,
  Muted,
  Nav,
  Button,
  Notice,
  Busy,
  Field,
  useResource,
  useAction,
} from "../../src/ui";
export default function Profile() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { api, me } = useSession();
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
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
  return (
    <Screen>
      {r.loading ? <Busy /> : null}
      <Notice message={r.error} retry={r.reload} />
      {d ? (
        <>
          {publicMediaUrl(config.mediaOrigin, d.profile.profile_pic_key) ? (
            <Image
              source={{
                uri: publicMediaUrl(
                  config.mediaOrigin,
                  d.profile.profile_pic_key,
                )!,
              }}
              accessibilityLabel={`${d.profile.full_name} profile picture`}
              style={{ width: 96, height: 96, borderRadius: 48 }}
            />
          ) : null}
          <Title>{d.profile.full_name}</Title>
          <Muted>
            @{d.profile.handle} · {d.profile.roles.join(", ")} ·{" "}
            {d.profile.location_city}
          </Muted>
          <Copy>{d.profile.bio}</Copy>
          <Muted>{d.profile.skills_gear.join(" · ")}</Muted>
          {d.profile.id === me?.id ? (
            <Nav title="Edit profile" href="/onboarding" />
          ) : (
            <>
              <Button
                title="Message"
                disabled={a.busy}
                onPress={() =>
                  act(async () => {
                    const c = await api!.chat.open(d.profile.id);
                    if (c.error) throw c.error;
                    router.push({
                      pathname: "/chat/[id]",
                      params: { id: c.data },
                    });
                  })
                }
              />
              <Button
                title={d.following ? "Unfollow" : "Follow"}
                secondary
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
                title={d.blocked ? "Unblock" : "Block creative"}
                secondary
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
            </>
          )}
          <Title>Work</Title>
          {d.films.length ? (
            d.films.map((f) => <FilmTile key={f.id} film={f} />)
          ) : (
            <Muted>No published films yet.</Muted>
          )}
          <Title>Credits</Title>
          {d.credits.map((c) => (
            <Nav
              key={c.id}
              title={c.role}
              href={{ pathname: "/film/[id]", params: { id: c.film_id } }}
            />
          ))}
          {d.profile.id !== me?.id ? (
            <>
              <Field
                label="Report profile — describe the issue"
                value={reason}
                onChangeText={setReason}
                multiline
              />
              <Button
                title="Send report"
                secondary
                disabled={a.busy || reason.trim().length < 3}
                onPress={() =>
                  act(async () => {
                    await report(
                      api!,
                      me!.id,
                      { profile_id: d.profile.id },
                      reason,
                    );
                    setReason("");
                    setNotice("Report sent for review.");
                  })
                }
              />
            </>
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
