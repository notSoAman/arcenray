import { useCallback, useState } from "react";
import { View } from "react-native";
import { useSession } from "../../src/session";
import { filmPage, type Film } from "../../src/data";
import { FeaturedFilm, PosterCard } from "../../src/cards";
import { Spectrum } from "../../src/visuals";
import {
  Screen,
  Kicker,
  PageTitle,
  SectionTitle,
  Muted,
  Notice,
  Busy,
  Button,
  StatePanel,
  Nav,
  useResource,
  useAction,
} from "../../src/ui";
import { colors } from "../../src/theme";

export default function Home() {
  const { api, me } = useSession();
  const [more, setMore] = useState<Film[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const a = useAction();

  const load = useCallback(async () => {
    if (!api) return [];
    return filmPage(api, 0);
  }, [api]);
  const r = useResource(load);

  const rows = [...(r.data ?? []), ...more];
  const featured = rows[0];
  const rest = rows.slice(1);
  const firstName = me ? me.full_name.split(/\s+/)[0] || `@${me.handle}` : null;

  return (
    <Screen>
      <View style={{ gap: 8 }}>
        <Kicker color={colors.pink}>
          {firstName ? `For ${firstName}` : "Independent cinema"}
        </Kicker>
        <PageTitle>Short films for you</PageTitle>
        <Muted>
          {me
            ? "Share your work with the community."
            : "Discover independent films. Browse as a guest."}
        </Muted>
      </View>

      {!api ? (
        <StatePanel
          title="Films aren't connected yet"
          body="Add public backend configuration to load films."
        />
      ) : r.loading ? (
        <Busy />
      ) : null}

      <Notice message={r.error} retry={r.reload} />

      {!r.loading && !r.error && !featured ? (
        <StatePanel
          title="No short films to show yet."
          body="When filmmakers publish on arcenray, their work appears here — ranked by what you watch. Check back soon."
        >
          <Spectrum kind="strip" style={{ height: 72, borderRadius: 18 }} />
        </StatePanel>
      ) : null}

      {featured ? <FeaturedFilm film={featured} kicker="Tonight's pick" /> : null}

      {rest.length > 0 ? (
        <View style={{ gap: 16 }}>
          <SectionTitle>More to watch</SectionTitle>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {rest.map((f) => (
              <View key={f.id} style={{ width: "48%", flexGrow: 1, minWidth: 140 }}>
                <PosterCard film={f} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <Nav title="Publish your film" href="/publish" />
      <Notice message={a.error} />

      {rows.length >= 20 && hasMore ? (
        <Button
          title={a.busy ? "Loading…" : "Load more films"}
          disabled={a.busy}
          onPress={() =>
            a.run(async () => {
              if (!api) return;
              const next = await filmPage(api, rows.length);
              setHasMore(next.length === 20);
              setMore((old) => [
                ...old,
                ...next.filter((n) => !rows.some((x) => x.id === n.id)),
              ]);
            })
          }
        />
      ) : null}
    </Screen>
  );
}
