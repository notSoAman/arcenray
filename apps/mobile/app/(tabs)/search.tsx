import { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  FILM_GENRES,
  scopeDiscoverySearch,
  type SearchInput,
} from "@repo/shared";
import { useSession } from "../../src/session";
import {
  filmColumns,
  profileColumns,
  roleLabels,
  roleOptions,
  type Film,
} from "../../src/data";
import { RowCard, PersonRow } from "../../src/cards";
import { IconSearch } from "../../src/icons";
import {
  Screen,
  PageTitle,
  Kicker,
  Muted,
  Button,
  Chips,
  Notice,
  StatePanel,
  ScopeTabs,
  Pill,
  useResource,
} from "../../src/ui";
import { colors, fonts, radius } from "../../src/theme";

type ProfileRow = {
  id: string;
  handle: string;
  full_name: string;
  roles: string[];
  location_city: string | null;
  profile_pic_key: string | null;
};

type SearchResult = {
  id: string;
  kind: string;
  title: string;
  summary: string;
};
type Kind = "all" | "film" | "profile";

const PROMPTS = [
  "quiet night-time dramas",
  "editors who cut documentaries",
  "composers for a short film",
];

export default function Search() {
  const { kind, browse } = useLocalSearchParams<{
    kind?: string;
    browse?: string;
  }>();
  const initialKind = kind === "profile" ? "profile" : "all";
  // Tabs stay mounted. Each explicit Find people entry starts a fresh people browse,
  // even if the previous visit changed the local scope to Films.
  return (
    <SearchContent
      key={`${initialKind}:${browse ?? ""}`}
      initialKind={initialKind}
    />
  );
}

function SearchContent({ initialKind }: { initialKind: Kind }) {
  const { api } = useSession();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [role, setRole] = useState("");
  const [genre, setGenre] = useState("");
  const [kind, setKind] = useState<Kind>(initialKind);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [submitted, setSubmitted] = useState<SearchInput | null>(
    initialKind === "profile"
      ? { query: "", kind: "profile", limit: 30 }
      : null,
  );
  const load = useCallback(async () => {
    if (!submitted) return null;
    if (!api) throw new Error("Search is unavailable.");
    const res = await api.search(submitted);
    if (res.error || !res.data)
      throw res.error ?? new Error("Search is unavailable.");
    const results = res.data.results as SearchResult[];
    const filmIds = results.filter((x) => x.kind === "film").map((x) => x.id);
    const profileIds = results
      .filter((x) => x.kind === "profile")
      .map((x) => x.id);
    const [f, p] = await Promise.all([
      filmIds.length
        ? api.supabase
            .from("films")
            .select(filmColumns)
            .eq("status", "published")
            .in("id", filmIds)
        : Promise.resolve({ data: [], error: null }),
      profileIds.length
        ? api.supabase
            .from("profiles")
            .select(profileColumns)
            .in("id", profileIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (f.error || p.error) throw f.error ?? p.error;
    const byId = new Map(((f.data ?? []) as Film[]).map((x) => [x.id, x]));
    const byProfile = new Map(
      ((p.data ?? []) as ProfileRow[]).map((x) => [x.id, x]),
    );
    return {
      input: submitted,
      films: filmIds
        .map((id) => byId.get(id))
        .filter((x): x is Film => Boolean(x)),
      people: profileIds
        .map((id) => byProfile.get(id))
        .filter((x): x is ProfileRow => Boolean(x)),
      mode: res.data.mode,
    };
  }, [api, submitted]);
  const a = useResource(load);
  const result = a.data?.input === submitted ? a.data : null;
  const busy = submitted !== null && (a.loading || (!result && !a.error));
  const searched = submitted !== null;
  // Never show an earlier request's results under new filters or after a failure.
  const films = !busy && !a.error ? (result?.films ?? []) : [];
  const people = !busy && !a.error ? (result?.people ?? []) : [];
  const mode = result?.mode;

  function runSearch(overrides?: {
    query?: string;
    city?: string;
    role?: string;
    genre?: string;
    kind?: Kind;
  }) {
    const q = (overrides?.query ?? query).trim();
    const c = (overrides?.city ?? city).trim();
    const r = overrides?.role !== undefined ? overrides.role : role;
    const g = overrides?.genre !== undefined ? overrides.genre : genre;
    const k = overrides?.kind ?? kind;
    const input = scopeDiscoverySearch(
      {
        query: q,
        city: c || undefined,
        role: r || undefined,
        genre: g || undefined,
        limit: 30,
      },
      k,
    );
    setRole(input.role ?? "");
    setGenre(input.genre ?? "");
    setKind(k);
    setSubmitted(input);
  }

  const total = films.length + people.length;
  const filtersOn = Boolean(city || role || genre);

  return (
    <Screen>
      <PageTitle size={38}>Search</PageTitle>
      {!searched ? (
        <Muted>
          Search films and collaborators by mood, craft, city or words.
        </Muted>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderRadius: 28,
          backgroundColor: colors.graphite,
          borderWidth: 1.5,
          borderColor: colors.line,
          padding: 6,
          paddingLeft: 18,
        }}
      >
        <IconSearch size={20} color={colors.faint} />
        <TextInput
          accessibilityLabel="Search films and people"
          value={query}
          onChangeText={setQuery}
          placeholder="Search names, titles, or describe a feeling"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          editable={!busy}
          maxLength={500}
          onSubmitEditing={() => void runSearch()}
          returnKeyType="search"
          style={{
            flex: 1,
            minWidth: 0,
            height: 46,
            color: colors.text,
            fontFamily: fonts.regular,
            fontSize: 16,
          }}
        />
        <Pressable
          accessibilityRole="button"
          disabled={busy || !api}
          onPress={() => void runSearch()}
          style={({ pressed }) => ({
            minHeight: 46,
            paddingHorizontal: 18,
            borderRadius: radius.pill,
            backgroundColor: colors.ember,
            alignItems: "center",
            justifyContent: "center",
            opacity: busy || !api ? 0.6 : pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 14 }}>
            {busy ? "Searching…" : "Search"}
          </Text>
        </Pressable>
      </View>

      {!searched ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
          }}
        >
          <Kicker
            color={colors.orange}
            style={{ fontStyle: "italic", marginRight: 2 }}
          >
            Try
          </Kicker>
          {PROMPTS.map((p) => (
            <Pressable
              key={p}
              accessibilityRole="button"
              onPress={() => {
                setQuery(p);
                void runSearch({ query: p });
              }}
              style={({ pressed }) => ({
                minHeight: 36,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.line,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  color: colors.textSoft,
                  fontFamily: fonts.regular,
                  fontSize: 13,
                }}
              >
                “{p}”
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <ScopeTabs
        items={[
          { key: "all", label: "All" },
          { key: "film", label: "Films" },
          { key: "profile", label: "People" },
        ]}
        value={kind}
        onChange={(k) => {
          setKind(k);
          void runSearch({ kind: k });
        }}
      />

      {searched ? (
        <View
          style={{
            gap: 20,
            padding: 20,
            borderRadius: radius.card,
            backgroundColor: colors.graphite,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Advanced search filters"
              accessibilityState={{ expanded: filtersExpanded }}
              onPress={() => setFiltersExpanded((open) => !open)}
              style={{ minHeight: 44, flex: 1, justifyContent: "center" }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontFamily: fonts.extraBold,
                  fontSize: 18,
                }}
              >
                Filters{filtersOn ? " · active" : ""}{" "}
                {filtersExpanded ? "−" : "+"}
              </Text>
            </Pressable>
            {filtersOn ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setCity("");
                  setRole("");
                  setGenre("");
                  void runSearch({
                    city: "",
                    role: "",
                    genre: "",
                    kind: "all",
                  });
                }}
                style={{ minHeight: 36, justifyContent: "center" }}
              >
                <Text
                  style={{
                    color: colors.muted,
                    fontFamily: fonts.regular,
                    fontSize: 13,
                  }}
                >
                  Reset
                </Text>
              </Pressable>
            ) : null}
          </View>

          {filtersExpanded ? (
            <>
              <View style={{ gap: 10 }}>
                <Kicker>Location</Kicker>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <TextInput
                    accessibilityLabel="Exact city"
                    maxLength={100}
                    value={city}
                    onChangeText={setCity}
                    placeholder="Exact city, e.g. Kochi"
                    placeholderTextColor={colors.faint}
                    autoCapitalize="words"
                    editable={!busy}
                    onSubmitEditing={() => void runSearch()}
                    returnKeyType="search"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: 44,
                      paddingHorizontal: 16,
                      borderRadius: 22,
                      borderWidth: 1,
                      borderColor: "rgba(243,239,233,0.16)",
                      backgroundColor: colors.void,
                      color: colors.text,
                      fontFamily: fonts.regular,
                      fontSize: 14,
                    }}
                  />
                  <Pill
                    label="Apply"
                    on={false}
                    onPress={() => void runSearch()}
                  />
                </View>
              </View>

              <View style={{ gap: 10 }}>
                <Kicker>People · role</Kicker>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {roleOptions.map((r) => (
                    <Pill
                      key={r}
                      label={roleLabels[r] ?? r}
                      on={role === r}
                      disabled={busy}
                      onPress={() => {
                        const next = role === r ? "" : r;
                        setRole(next);
                        setGenre("");
                        setKind(next ? "profile" : "all");
                        void runSearch({
                          role: next,
                          genre: "",
                          kind: next ? "profile" : "all",
                        });
                      }}
                    />
                  ))}
                </View>
              </View>

              <View style={{ gap: 4 }}>
                <Chips
                  label="Films · genre"
                  kicker
                  options={FILM_GENRES}
                  selected={genre ? [genre] : []}
                  disabled={busy}
                  onToggle={(v) => {
                    const next = genre === v ? "" : v;
                    setGenre(next);
                    setRole("");
                    setKind(next ? "film" : "all");
                    void runSearch({
                      genre: next,
                      role: "",
                      kind: next ? "film" : "all",
                    });
                  }}
                />
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      <Notice message={a.error} retry={a.reload} />

      {searched && busy ? <Muted>Searching…</Muted> : null}

      {searched && !busy && total === 0 && !a.error ? (
        <StatePanel
          title="Nothing matched that yet"
          body={
            kind === "profile"
              ? "No creatives matched these filters. Try another role or city, or clear your search. You can also discover people through a film’s listed credits."
              : "Try describing a mood, a place or a kind of person, or loosen the advanced filters."
          }
        >
          <Button
            title="Clear search and filters"
            variant="primary"
            onPress={() => {
              setQuery("");
              setCity("");
              setRole("");
              setGenre("");
              setKind("all");
              setSubmitted(null);
            }}
          />
        </StatePanel>
      ) : null}

      {searched && total > 0 ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Muted>
            {total} result{total === 1 ? "" : "s"}
            {submitted?.query
              ? ` for “${submitted.query}”`
              : " matching your filters"}
            {submitted?.city ? ` in ${submitted.city}` : ""}
          </Muted>
          <Kicker>
            {submitted?.query
              ? mode === "hybrid"
                ? "Meaning + words"
                : "Names + words"
              : "Browse"}
          </Kicker>
        </View>
      ) : null}

      {searched && films.length > 0 && (kind === "all" || kind === "film") ? (
        <View style={{ gap: 10 }}>
          <Text
            style={{
              color: colors.text,
              fontFamily: fonts.extraBold,
              fontSize: 22,
            }}
          >
            Films
          </Text>
          {films.map((f) => (
            <RowCard key={f.id} film={f} />
          ))}
        </View>
      ) : null}

      {searched &&
      people.length > 0 &&
      (kind === "all" || kind === "profile") ? (
        <View style={{ gap: 10 }}>
          <Text
            style={{
              color: colors.text,
              fontFamily: fonts.extraBold,
              fontSize: 22,
            }}
          >
            People
          </Text>
          {people.map((p) => (
            <PersonRow key={p.id} person={p} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
