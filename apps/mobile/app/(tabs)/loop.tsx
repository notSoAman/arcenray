import { useCallback, useState } from "react";
import { useSession } from "../../src/session";
import {
  Screen,
  Title,
  Button,
  Muted,
  Notice,
  Busy,
  useResource,
  useAction,
  Nav,
} from "../../src/ui";
import { FilmTile } from "../../src/cards";
import { FilmPlayer } from "../../src/player";
export default function Loop() {
  const { api, me } = useSession();
  const [excluded, setExcluded] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const a = useAction();
  const load = useCallback(async () => {
    if (!api) return [];
    const r = await api.loop.page(excluded, 10);
    if (r.error) throw r.error;
    return r.data ?? [];
  }, [api, excluded]);
  const r = useResource(load);
  const film = r.loading ? undefined : r.data?.[0];
  return (
    <Screen>
      <Title>Loop</Title>
      <Muted>A moment that stays with you.</Muted>
      {r.loading ? <Busy /> : null}
      <Notice message={r.error} retry={r.reload} />
      {film ? (
        <>
          <FilmTile film={film} />
          {film.hook_key ? (
            <>
              <Button
                title={preview ? "Hide preview" : "Play muted preview"}
                onPress={() => setPreview(!preview)}
              />
              {preview ? <FilmPlayer film={film} hook /> : null}
            </>
          ) : (
            <Muted>
              This film has no discovery clip. Open the film to watch it.
            </Muted>
          )}
          {me ? (
            <>
              {(["more", "less"] as const).map((p) => (
                <Button
                  key={p}
                  secondary
                  title={p === "more" ? "More like this" : "Less like this"}
                  disabled={a.busy}
                  onPress={() =>
                    a.run(async () => {
                      const x = await api!.loop.feedback(film.id, p);
                      if (x.error) throw x.error;
                      setPreview(false);
                      setExcluded((ids) => [...ids, film.id].slice(-10000));
                    })
                  }
                />
              ))}
            </>
          ) : (
            <Nav title="Sign in to tune your feed" href="/sign-in" />
          )}
          <Button
            title="Next film"
            onPress={() => {
              setPreview(false);
              setExcluded((ids) => [...ids, film.id].slice(-10000));
            }}
          />
        </>
      ) : !r.loading && !r.error ? (
        <Muted>No more films right now.</Muted>
      ) : null}
      <Notice message={a.error} />
    </Screen>
  );
}
