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
        onChangeText={setQuery}
      />
      <Field label="City (exact)" value={city} onChangeText={setCity} />
      <Field
        label="Creative role (exact)"
        value={role}
        onChangeText={setRole}
      />
      <Field label="Genre (exact)" value={genre} onChangeText={setGenre} />
      {(["all", "film", "profile"] as const).map((k) => (
        <Button
          key={k}
          secondary={kind !== k}
          title={k === "all" ? "All" : k === "film" ? "Films" : "People"}
          onPress={() => setKind(k)}
        />
      ))}
      <Button
        title={a.busy ? "Searching…" : "Search"}
        disabled={!api || !query.trim() || a.busy}
        onPress={() =>
          a.run(async () => {
            const r = await api!.search({
              query: query.trim(),
              kind,
              city: city.trim() || undefined,
              role: role.trim() || undefined,
              genre: genre.trim() || undefined,
            });
            if (r.error) throw r.error;
            setResults(r.data?.results ?? []);
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
