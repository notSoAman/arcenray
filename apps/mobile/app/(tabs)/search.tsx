import { useState } from "react";
import { View, TextInput, Pressable, Text } from "react-native";
import { FILM_GENRES } from "@repo/shared";
import { useSession } from "../../src/session";
import { filmColumns, profileColumns, type Film } from "../../src/data";
import { RowCard, PersonRow } from "../../src/cards";
import { IconSearch } from "../../src/icons";
import {
  Screen,
  Kicker,
  PageTitle,
  Field,
  Button,
  Chips,
  Notice,
  StatePanel,
  Pill,
  useAction,
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

type SearchResult = { id: string; kind: string; title: string; summary: string };

const PROMPTS = [
  "quiet night-time dramas",
  "editors who cut documentaries",
  "films shot in Mumbai",
  "composers for a short film",
];

export default function Search() {
  const { api } = useSession();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [role, setRole] = useState("");
  const [genre, setGenre] = useState("");
  const [kind, setKind] = useState<"all" | "film" | "profile">("all");
  const [films, setFilms] = useState<Film[]>([]);
  const [people, setPeople] = useState<ProfileRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [mode, setMode] = useState<string | null>(null);
  const a = useAction();

  async function runSearch(override?: string) {
    const q = (override ?? query).trim();
    await a.run(async () => {
      setFilms([]);
      setPeople([]);
      setSearched(true);
      const r = await api!.search({
        query: q,
        kind,
        city: city.trim() || undefined,
        role: role.trim() || undefined,
        genre: genre.trim() || undefined,
      });
      if (r.error || !r.data) throw r.error ?? new Error("Search is unavailable. Please try again.");
      setMode(r.data.mode ?? null);
      const results = r.data.results as SearchResult[];
      const filmIds = results.filter((x) => x.kind === "film").map((x) => x.id);
      const profileIds = results.filter((x) => x.kind === "profile").map((x) => x.id);
      const f = filmIds.length
        ? await api!.supabase.from("films").select(filmColumns).in("id", filmIds)
        : null;
      const p = profileIds.length
        ? await api!.supabase
            .from("profiles")
            .select(profileColumns)
            .in("id", profileIds)
        : null;
      if (f?.error) throw f.error;
      if (p?.error) throw p.error;
      const filmData = (f?.data ?? []) as Film[];
      const profileData = (p?.data ?? []) as ProfileRow[];
      const byId = new Map(filmData.map((x) => [x.id, x]));
      setFilms(filmIds.map((fid) => byId.get(fid)).filter((x): x is Film => Boolean(x)));
      setPeople(profileData.filter((x) => profileIds.includes(x.id)));
    });
  }

  const total = films.length + people.length;

  return (
    <Screen>
      <PageTitle>Search</PageTitle>

      {/* Search bar */}
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
          paddingLeft: 16,
        }}
      >
        <IconSearch size={20} color={colors.faint} />
        <TextInput
          accessibilityLabel="Search films and people"
          value={query}
          onChangeText={setQuery}
          placeholder="Search names, titles, or a feeling"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          editable={!a.busy}
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
          disabled={a.busy || !api}
          onPress={() => void runSearch()}
          style={{
            minHeight: 46,
            paddingHorizontal: 16,
            borderRadius: radius.pill,
            backgroundColor: colors.ember,
            alignItems: "center",
            justifyContent: "center",
            opacity: a.busy || !api ? 0.6 : 1,
          }}
        >
          <Text style={{ color: "#fff", fontFamily: fonts.semibold, fontSize: 15 }}>
            {a.busy ? "Searching…" : "Search"}
          </Text>
        </Pressable>
      </View>

      {/* Try prompts */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <Kicker color={colors.orange}>Try</Kicker>
        {PROMPTS.map((p) => (
          <Pressable
            key={p}
            accessibilityRole="button"
            onPress={() => {
              setQuery(p);
              void runSearch(p);
            }}
            style={{
              minHeight: 36,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.line,
            }}
          >
            <Text style={{ color: colors.textSoft, fontFamily: fonts.regular, fontSize: 13 }}>
              “{p}”
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Scope */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["all", "film", "profile"] as const).map((k) => (
          <Pill
            key={k}
            label={k === "all" ? "All" : k === "film" ? "Films" : "People"}
            on={kind === k}
            onPress={() => setKind(k)}
          />
        ))}
      </View>

      {/* Advanced filters */}
      <View style={{ gap: 12 }}>
        <Field
          label="City (exact)"
          value={city}
          onChangeText={setCity}
          editable={!a.busy}
        />
        <Field
          label="Creative role (e.g. editor)"
          value={role}
          onChangeText={(v) => {
            setRole(v);
            if (v.trim()) {
              setKind("profile");
              setGenre("");
            }
          }}
          editable={!a.busy}
        />
        <Chips
          label="Genre"
          options={FILM_GENRES}
          selected={genre ? [genre] : []}
          disabled={a.busy}
          onToggle={(v) => {
            const next = genre === v ? "" : v;
            setGenre(next);
            if (next) {
              setKind("film");
              setRole("");
            }
          }}
        />
      </View>

      <Notice message={a.error} />

      {!searched ? (
        <View
          style={{
            borderRadius: radius.card,
            backgroundColor: colors.graphite,
            padding: 24,
            gap: 10,
          }}
        >
          <Text style={{ color: colors.text, fontFamily: fonts.extraBold, fontSize: 24 }}>
            Search by feeling, not just by name.
          </Text>
          <Text style={{ color: colors.textSoft, fontFamily: fonts.regular, fontSize: 15, lineHeight: 23 }}>
            Describe what you’re looking for — a mood, a place, a craft — and
            arcenray matches films and people by meaning and by words.
          </Text>
        </View>
      ) : null}

      {searched && total === 0 && !a.busy && !a.error ? (
        <StatePanel
          title="Nothing matched that yet"
          body="Try describing a mood, a place or a kind of person, or loosen the filters."
        />
      ) : null}

      {searched && mode ? (
        <Kicker color={colors.faint}>
          {mode === "hybrid" ? "Meaning + words" : "Names + words"}
        </Kicker>
      ) : null}

      {films.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.text, fontFamily: fonts.extraBold, fontSize: 22 }}>
            Films
          </Text>
          {films.map((f) => (
            <RowCard key={f.id} film={f} />
          ))}
        </View>
      ) : null}

      {people.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.text, fontFamily: fonts.extraBold, fontSize: 22 }}>
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
