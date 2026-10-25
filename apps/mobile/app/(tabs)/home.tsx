import { useCallback, useState } from "react";
import { useSession } from "../../src/session";
import { filmPage, type Film } from "../../src/data";
import { FilmTile } from "../../src/cards";
import {
  Screen,
  Title,
  Muted,
  Notice,
  Busy,
  Button,
  Nav,
  useResource,
  useAction,
  Field,
} from "../../src/ui";
export default function Home() {
  const { api, me } = useSession();
  const [genre, setGenre] = useState("");
  const [activeGenre, setActiveGenre] = useState("");
  const [more, setMore] = useState<Film[]>([]);
  const a = useAction();
  const [hasMore, setHasMore] = useState(true);
  const load = useCallback(async () => {
    if (!api) return [];
    return filmPage(api, 0, activeGenre || undefined);
  }, [api, activeGenre]);
  const r = useResource(load);
  const rows = [...(r.data ?? []), ...more];
  return (
    <Screen>
      <Title>Find your people. Make your art.</Title>
      <Muted>
        {me
          ? `For you, ${me.full_name}`
          : "Discover independent films. Browse as a guest."}
      </Muted>
      <Nav title="Publish your film" href="/publish" />
      <Field label="Genre filter" value={genre} onChangeText={setGenre} />
      <Button
        title="Apply filter"
        onPress={() => {
          setMore([]);
          setHasMore(true);
          setActiveGenre(genre.trim());
          r.reload();
        }}
        secondary
      />
      {!api ? (
        <Notice message="Add public backend configuration to load films." />
      ) : r.loading ? (
        <Busy />
      ) : null}
      <Notice message={r.error} retry={r.reload} />
      {rows.map((f) => (
        <FilmTile key={f.id} film={f} />
      ))}
      {!r.loading && !rows.length && !r.error ? (
        <Muted>No published films yet. Check back soon.</Muted>
      ) : null}
      <Notice message={a.error} />
      {rows.length >= 20 && hasMore ? (
        <Button
          title={a.busy ? "Loading…" : "Load more films"}
          disabled={a.busy}
          onPress={() =>
            a.run(async () => {
              if (!api) return;
              const next = await filmPage(
                api,
                rows.length,
                activeGenre || undefined,
              );
              setHasMore(next.length === 20);
              setMore((old) => [
                ...old,
                ...next.filter((n) => !rows.some((x) => x.id === n.id)),
              ]);
            })
          }
        />
      ) : null}
      <Button
        title="Refresh"
        secondary
        onPress={() => {
          setMore([]);
          setHasMore(true);
          r.reload();
        }}
      />
    </Screen>
  );
}
