import { useState } from "react";
import { router } from "expo-router";
import { useSession } from "../../src/session";
import {
  Screen,
  Title,
  Field,
  Button,
  Copy,
  Muted,
  Notice,
  Panel,
  useAction,
} from "../../src/ui";
type Result = { id: string; kind: string; title: string; summary: string };
export default function Search() {
  const { api } = useSession();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [role, setRole] = useState("");
  const [genre, setGenre] = useState("");
  const [kind, setKind] = useState<"all" | "film" | "profile">("all");
  const [results, setResults] = useState<Result[] | null>(null);
  const a = useAction();
  return (
    <Screen>
      <Title>Find your next collaborator.</Title>
      <Field
        label="Search films and people"
        value={query}
        editable={!a.busy}
        autoCapitalize="none"
        onChangeText={setQuery}
      />
      <Field
        label="City"
        value={city}
        editable={!a.busy}
        onChangeText={setCity}
      />
      <Field
        label="Creative role (e.g. editor)"
        value={role}
        editable={!a.busy}
        onChangeText={(value) => {
          setRole(value);
          if (value.trim()) {
            setKind("profile");
            setGenre("");
          }
        }}
      />
      <Field
        label="Genre (e.g. Drama)"
        value={genre}
        editable={!a.busy}
        onChangeText={(value) => {
          setGenre(value);
          if (value.trim()) {
            setKind("film");
            setRole("");
          }
        }}
      />
      {(["all", "film", "profile"] as const).map((k) => (
        <Button
          key={k}
          secondary={kind !== k}
          title={k === "all" ? "All" : k === "film" ? "Films" : "People"}
          disabled={a.busy}
          onPress={() => {
            setKind(k);
            if (k !== "profile") setRole("");
            if (k !== "film") setGenre("");
          }}
        />
      ))}
      <Button
        title={a.busy ? "Searching…" : "Search"}
        disabled={!api || a.busy}
        onPress={() =>
          a.run(async () => {
            setResults(null);
            const r = await api!.search({
              query: query.trim(),
              kind,
              city: city.trim() || undefined,
              role: role.trim() || undefined,
              genre: genre.trim() || undefined,
            });
            if (r.error || !r.data)
              throw (
                r.error || new Error("Search is unavailable. Please try again.")
              );
            setResults(r.data.results);
          })
        }
      />
      <Notice message={a.error} />
      {results?.length === 0 ? (
        <Muted>No matches. Try different words or filters.</Muted>
      ) : null}
      {results?.map((x) => (
        <Panel key={`${x.kind}:${x.id}`}>
          <Copy>{x.title}</Copy>
          <Muted>{x.summary}</Muted>
          <Button
            title={x.kind === "film" ? "View film" : "View creative"}
            onPress={() =>
              a.run(async () => {
                if (x.kind === "film")
                  router.push({ pathname: "/film/[id]", params: { id: x.id } });
                else {
                  const p = await api!.supabase
                    .from("profiles")
                    .select("handle")
                    .eq("id", x.id)
                    .single();
                  if (p.error) throw p.error;
                  router.push({
                    pathname: "/u/[handle]",
                    params: { handle: p.data.handle },
                  });
                }
              })
            }
          />
        </Panel>
      ))}
    </Screen>
  );
}
