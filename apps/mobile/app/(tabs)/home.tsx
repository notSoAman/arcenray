import { useCallback, useEffect, useState } from "react";
import { RefreshControl, View } from "react-native";
import { Link, router } from "expo-router";
import { useSession } from "../../src/session";
import { filmPage, type Film } from "../../src/data";
import { FeaturedFilm, PersonRow, PosterCard } from "../../src/cards";
import { Spectrum } from "../../src/visuals";
import {
  Screen,
  Kicker,
  PageTitle,
  SectionTitle,
  Muted,
  Notice,
  Button,
  StatePanel,
  Skeleton,
  useResource,
  useAction,
} from "../../src/ui";
import { colors, fonts } from "../../src/theme";

type Nearby = {
  id: string;
  handle: string;
  full_name: string;
  roles: string[];
  location_city: string | null;
  profile_pic_key: string | null;
};

export default function Home() {
  const { api, me } = useSession();
  const [more, setMore] = useState<Film[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const a = useAction();

  const load = useCallback(async () => {
    if (!api) return { films: [] as Film[], nearby: [] as Nearby[] };
    const films = await filmPage(api, 0);
    let nearby: Nearby[] = [];
    if (me?.location_city) {
      const r = await api.supabase
        .from("profiles")
        .select("id,handle,full_name,roles,location_city,profile_pic_key")
        .ilike("location_city", me.location_city.replace(/[%_\\]/g, "\\$&"))
        .neq("id", me.id)
        .limit(8);
      if (!r.error) nearby = (r.data ?? []) as Nearby[];
    }
    return { films, nearby };
  }, [api, me]);
  const r = useResource(load);
  const [refreshing, setRefreshing] = useState(false);

  const films = [...(r.data?.films ?? []), ...more];
  const nearby = r.data?.nearby ?? [];
  const featured = films[0];
  const rest = films.slice(1);
  const firstName = me ? me.full_name.split(/\s+/)[0] || `@${me.handle}` : null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ends the pull-to-refresh spinner.
    if (!r.loading) setRefreshing(false);
  }, [r.loading]);

  function refresh() {
    setRefreshing(true);
    r.reload();
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={colors.bone}
          colors={[colors.ember]}
          progressBackgroundColor={colors.graphite}
        />
      }
    >
      <View style={{ gap: 8 }}>
        <Kicker color={colors.pink}>
          {firstName ? `For ${firstName}` : "Independent cinema"}
        </Kicker>
        <PageTitle size={36}>Short films for you</PageTitle>
      </View>

      {!api ? (
        <StatePanel
          title="Films aren't connected yet"
          body="Add the public backend configuration to load films."
        />
      ) : r.loading && !featured ? (
        <View style={{ gap: 22 }}>
          <Skeleton style={{ width: "100%", height: 520, borderRadius: 32 }} />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Skeleton style={{ flex: 1, aspectRatio: 2 / 3 }} />
            <Skeleton style={{ flex: 1, aspectRatio: 2 / 3 }} />
          </View>
        </View>
      ) : null}

      <Notice message={r.error} retry={r.reload} />

      {!r.loading && !r.error && !featured ? (
        <StatePanel
          title="No short films to show yet."
          body="When filmmakers publish on arcenray, their work appears here — ranked by what you watch. Check back soon."
          art={<Spectrum kind="strip" style={{ height: 72 }} />}
        >
          <Button
            title="Browse Loop"
            variant="primary"
            onPress={() => router.push("/loop")}
          />
        </StatePanel>
      ) : null}

      {featured ? (
        <FeaturedFilm film={featured} kicker="Tonight's pick" />
      ) : null}

      {rest.length > 0 || hasMore ? (
        <View style={{ gap: 16 }}>
          <View
            style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}
          >
            <SectionTitle style={{ flex: 1 }}>More to watch</SectionTitle>
            <Link href="/loop" style={{ paddingVertical: 10 }}>
              <Muted
                style={{ color: colors.muted, fontFamily: fonts.semibold }}
              >
                See all
              </Muted>
            </Link>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {rest.map((f) => (
              <View
                key={f.id}
                style={{ width: "47%", flexGrow: 1, minWidth: 140 }}
              >
                <PosterCard film={f} />
              </View>
            ))}
          </View>
          <Button
            title={a.busy ? "Loading…" : "Load more films"}
            variant="ghost"
            block
            disabled={a.busy}
            onPress={() =>
              a.run(async () => {
                if (!api) return;
                const next = await filmPage(api, films.length);
                setHasMore(next.length === 20);
                setMore((old) => [
                  ...old,
                  ...next.filter((n) => !films.some((x) => x.id === n.id)),
                ]);
              })
            }
          />
        </View>
      ) : null}

      {nearby.length > 0 ? (
        <View style={{ gap: 16 }}>
          <View style={{ gap: 8 }}>
            <Kicker>Near {me?.location_city}</Kicker>
            <SectionTitle>Filmmakers close to you</SectionTitle>
          </View>
          <View style={{ gap: 10 }}>
            {nearby.map((p) => (
              <PersonRow key={p.id} person={p} />
            ))}
          </View>
        </View>
      ) : null}

      <Notice message={a.error} />
    </Screen>
  );
}
