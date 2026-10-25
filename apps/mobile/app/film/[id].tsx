import { useCallback, useState } from "react";
import { Share } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as Crypto from "expo-crypto";
import { uuidSchema } from "@repo/shared";
import { useSession } from "../../src/session";
import { filmDetail, toggleFilm, report } from "../../src/data";
import { FilmPlayer } from "../../src/player";
import {
  Screen,
  Title,
  Copy,
  Muted,
  Panel,
  Notice,
  Busy,
  Button,
  Nav,
  Field,
  useResource,
  useAction,
} from "../../src/ui";
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
        .select("handle,full_name")
        .eq("id", film.owner_id)
        .maybeSingle(),
      api.supabase
        .from("film_credits")
        .select("id,display_name,role,verification_state,profile_id")
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
          <Title>{d.film.title}</Title>
          <Muted>
            {d.film.genres.join(" · ")} · {d.film.language}
          </Muted>
          <FilmPlayer film={d.film} />
          <Copy>{d.film.synopsis}</Copy>
          {d.creator ? (
            <Nav
              title={`By ${d.creator.full_name}`}
              href={{
                pathname: "/u/[handle]",
                params: { handle: d.creator.handle },
              }}
            />
          ) : null}
          <Button
            title={d.liked ? "Unlike" : "Like"}
            disabled={a.busy}
            onPress={() =>
              act(async () => {
                await toggleFilm(
                  api!,
                  me!.id,
                  d.film.id,
                  "film_likes",
                  d.liked,
                );
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
          <Button
            title={d.saved ? "Remove bookmark" : "Bookmark"}
            secondary
            disabled={a.busy}
            onPress={() =>
              act(async () => {
                await toggleFilm(
                  api!,
                  me!.id,
                  d.film.id,
                  "film_bookmarks",
                  d.saved,
                );
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
          <Button
            title="Share film"
            secondary
            onPress={() => {
              void Share.share({
                message: `${d.film.title} — https://arcenray.com/films/${d.film.id}`,
              });
            }}
          />
          {me?.id === d.film.owner_id ? (
            <Nav
              title="Manage film and credits"
              href={{ pathname: "/publish", params: { draft: d.film.id } }}
            />
          ) : null}
          <Title>Credits</Title>
          {d.credits.length ? (
            d.credits.map((c) => (
              <Panel key={c.id}>
                <Copy>{c.display_name}</Copy>
                <Muted>
                  {c.role} ·{" "}
                  {c.verification_state === "verified"
                    ? "Verified credit"
                    : "Unverified credit"}
                </Muted>
              </Panel>
            ))
          ) : (
            <Muted>No credits listed yet.</Muted>
          )}
          {reported ? (
            <Copy>Report sent for review.</Copy>
          ) : (
            <>
              <Field
                label="Report this film — describe the issue"
                multiline
                value={reason}
                onChangeText={setReason}
                maxLength={1000}
              />
              <Button
                title="Send report"
                secondary
                disabled={a.busy || reason.trim().length < 3}
                onPress={() =>
                  act(async () => {
                    await report(api!, me!.id, { film_id: d.film.id }, reason);
                    setReported(true);
                  })
                }
              />
            </>
          )}
        </>
      ) : !r.loading && !r.error ? (
        <Muted>This film is unavailable.</Muted>
      ) : null}
      <Notice message={a.error} />
    </Screen>
  );
}
