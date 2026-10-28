import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import type { File } from "expo-file-system";
import {
  filmDraftSchema,
  parseFilmLink,
  uuidSchema,
  type FilmDraft,
} from "@repo/shared";
import type { MultipartState } from "@repo/shared/media";
import { filmRequirements } from "@repo/shared/media-preflight";
import { Gate, useSession } from "../src/session";
import {
  mainFilmTask,
  smallMediaTask,
  selectFilm,
  selectHook,
  selectImage,
} from "../src/media";
import {
  Screen,
  Title,
  Copy,
  Muted,
  Field,
  Button,
  Panel,
  Nav,
  Notice,
  Busy,
  useAction,
  useResource,
} from "../src/ui";
const empty: FilmDraft = {
  title: "",
  synopsis: "",
  genres: [],
  mood_tags: [],
  location_city: null,
  language: null,
  source: "r2_native",
  provider_id: null,
  film_asset_id: null,
  hook_asset_id: null,
  poster_asset_id: null,
};
type Draft = { id: string; title: string; status: string };
function Publisher() {
  const { draft: initial } = useLocalSearchParams<{ draft?: string }>();
  const { api, me } = useSession();
  const [draftId, setDraftId] = useState<string | null>(
    initial && uuidSchema.safeParse(initial).success ? initial : null,
  );
  const [input, setInput] = useState<FilmDraft>(empty);
  const [published, setPublished] = useState(false);
  const [genreText, setGenreText] = useState("");
  const [moodText, setMoodText] = useState("");
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [external, setExternal] = useState("");
  const [file, setFile] = useState<{
    name: string;
    file: File;
    tracksChecked: boolean;
  } | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [hook, setHook] = useState<File | null>(null);
  const [state, setState] = useState<Readonly<MultipartState> | null>(null);
  const [stage, setStage] = useState("");
  const [processing, setProcessing] = useState<{
    state: string;
    message?: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [creditQuery, setCreditQuery] = useState("");
  const [collaborators, setCollaborators] = useState<
    { id: string; full_name: string; handle: string }[]
  >([]);
  const [creditRole, setCreditRole] = useState("");
  const a = useAction();
  const task = useRef<ReturnType<typeof mainFilmTask> | null>(null);
  const small = useRef<
    Partial<Record<"poster" | "hook", ReturnType<typeof smallMediaTask>>>
  >({});
  const load = useCallback(async () => {
    const r = await api!.supabase
      .from("films")
      .select("id,title,status")
      .eq("owner_id", me!.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (r.error) throw r.error;
    return r.data;
  }, [api, me]);
  const drafts = useResource(load);
  useEffect(() => {
    let active = true;
    if (initial && uuidSchema.safeParse(initial).success && api)
      void api.films.get(initial).then((r) => {
        if (!active) return;
        if (r.error || !r.data) {
          setFormError("Could not load this film.");
          return;
        }
        const f = r.data;
        if (f.owner_id !== me?.id) {
          setFormError("This film is unavailable.");
          return;
        }
        setDraftId(f.id);
        setPublished(f.status === "published");
        setGenreText(f.genres.join(", "));
        setMoodText(f.mood_tags.join(", "));
        setInput({
          title: f.title,
          synopsis: f.synopsis,
          genres: f.genres,
          mood_tags: f.mood_tags,
          location_city: f.location_city,
          language: f.language,
          source: f.source as FilmDraft["source"],
          provider_id: f.provider_id,
          film_asset_id: f.film_asset_id,
          hook_asset_id: f.hook_asset_id,
          poster_asset_id: f.poster_asset_id,
        });
        if (f.source !== "r2_native")
          setExternal(
            f.source === "vimeo_embed"
              ? `https://vimeo.com/${f.provider_id}`
              : `https://www.youtube.com/watch?v=${f.provider_id}`,
          );
      });
    return () => {
      active = false;
    };
  }, [api, initial, me?.id]);
  useEffect(() => {
    const t = task,
      s = small;
    const subscription = AppState.addEventListener("change", (value) => {
      if (value !== "active") {
        t.current?.pause();
        Object.values(s.current).forEach((item) => item?.cancel());
      }
    });
    return () => {
      subscription.remove();
      t.current?.pause();
      Object.values(s.current).forEach((item) => item?.cancel());
    };
  }, []);
  function set<K extends keyof FilmDraft>(key: K, value: FilmDraft[K]) {
    setInput((old) => ({ ...old, [key]: value }));
  }
  function validated() {
    let value = {
      ...input,
      genres: genreText
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
      mood_tags: moodText
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    };
    if (input.source !== "r2_native")
      value = { ...value, ...parseFilmLink(external), film_asset_id: null };
    return filmDraftSchema.parse(value);
  }
  async function save(value: FilmDraft, id = draftId) {
    const r = id
      ? await api!.films.updateDraft(id, value)
      : await api!.films.createDraft(value);
    if (r.error) throw r.error;
    setDraftId(r.data.id);
    setInput(value);
    drafts.reload();
    return r.data.id;
  }
  async function checkProcessing(asset = input.film_asset_id) {
    if (!asset) return;
    const r = await api!.media.processing.status(asset);
    if (r.error) throw r.error;
    const value = r.data;
    if (value && typeof value === "object" && !Array.isArray(value))
      setProcessing({
        state: String(value.state ?? value.status ?? "unknown"),
        message: typeof value.message === "string" ? value.message : undefined,
      });
  }
  async function upload() {
    let value = validated();
    const id = await save(value);
    setStage("Checking storage…");
    const quota = await api!.media.storage();
    if (quota.error) throw quota.error;
    if (file && value.source === "r2_native") {
      if (!task.current)
        task.current = mainFilmTask(file.file, api!, me!.id, id, (next) => {
          setState(next);
          if (next.assetId)
            setInput((current) => ({
              ...current,
              film_asset_id: next.assetId!,
            }));
        });
      setStage("Uploading main film…");
      const receipt = await task.current.start();
      value = { ...value, film_asset_id: receipt.asset_id };
      await save(value, id);
      await checkProcessing(receipt.asset_id);
    }
    for (const item of [
      {
        kind: "poster" as const,
        file: poster,
        key: "poster_asset_id" as const,
      },
      { kind: "hook" as const, file: hook, key: "hook_asset_id" as const },
    ]) {
      if (!item.file) continue;
      setStage(`Uploading ${item.kind}…`);
      if (!small.current[item.kind])
        small.current[item.kind] = smallMediaTask(
          item.file,
          item.kind,
          api!,
          (s) =>
            setStage(
              `${item.kind}: ${s.stage} ${Math.round((100 * s.bytesSent) / Math.max(1, s.totalBytes))}%`,
            ),
        );
      const receipt = await small.current[item.kind]!.start();
      value = { ...value, [item.key]: receipt.asset_id };
      await save(value, id);
      if (item.kind === "poster") setPoster(null);
      else setHook(null);
      delete small.current[item.kind];
    }
    setStage(
      "Draft saved. Main films must finish processing before publication.",
    );
  }
  return (
    <Screen>
      <Title>Put your work out there.</Title>
      <Muted>
        Native MP4 upload or an external Vimeo/YouTube link. A poster is
        required; a discovery hook is optional.
      </Muted>
      {drafts.loading ? <Busy /> : null}
      <Notice message={drafts.error} retry={drafts.reload} />
      {!draftId ? (
        drafts.data?.map((d: Draft) => (
          <Nav
            key={d.id}
            title={`${d.title} · ${d.status}`}
            href={{ pathname: "/publish", params: { draft: d.id } }}
          />
        ))
      ) : (
        <Muted>Film {draftId}</Muted>
      )}
      {!published ? (
        <>
          <Field
            label="Title"
            value={input.title}
            onChangeText={(v) => set("title", v)}
            maxLength={200}
          />
          <Field
            label="Synopsis"
            value={input.synopsis}
            onChangeText={(v) => set("synopsis", v)}
            multiline
            maxLength={5000}
          />
          <Field
            label="Genres, separated by commas"
            value={genreText}
            onChangeText={setGenreText}
          />
          <Field
            label="Mood tags, separated by commas"
            value={moodText}
            onChangeText={setMoodText}
          />
          <Field
            label="City"
            value={input.location_city ?? ""}
            onChangeText={(v) => set("location_city", v || null)}
          />
          <Field
            label="Language"
            value={input.language ?? ""}
            onChangeText={(v) => set("language", v || null)}
          />
          <Button
            title={
              input.source === "r2_native"
                ? "Use external film link instead"
                : "Use native MP4 upload instead"
            }
            secondary
            disabled={a.busy || !!input.film_asset_id || !!state}
            onPress={() => {
              set(
                "source",
                input.source === "r2_native" ? "vimeo_embed" : "r2_native",
              );
              set("provider_id", null);
            }}
          />
          {input.source === "r2_native" ? (
            <>
              <Button
                title={file ? `Selected: ${file.name}` : "Select an MP4 film"}
                disabled={a.busy}
                onPress={() => {
                  setFormError(null);
                  void a.run(async () => {
                    if (
                      task.current &&
                      !["aborted", "complete"].includes(
                        task.current.state.stage,
                      )
                    )
                      throw new Error("Discard the current upload first");
                    let selected;
                    try {
                      selected = await selectFilm();
                    } catch (error) {
                      setFile(null);
                      task.current = null;
                      setState(null);
                      throw error;
                    }
                    if (selected) {
                      setFile(selected);
                      task.current = null;
                      setState(null);
                    }
                  });
                }}
              />
              <Muted>{filmRequirements}</Muted>
              {file && (
                <Muted>
                  {file.tracksChecked
                    ? "Track count checked. The server will verify codecs and the complete file after upload."
                    : "Could not check this file's tracks before upload. It may be rejected by the server; confirm it has one video track and at most one audio track."}
                </Muted>
              )}
              <Muted>
                Keep the app open during transfer. Leaving it pauses the upload;
                return and retry. After restart, reopen the draft and reselect
                the same file to resume verified parts.
              </Muted>
            </>
          ) : (
            <Field
              label="HTTPS Vimeo or YouTube link"
              value={external}
              onChangeText={setExternal}
              autoCapitalize="none"
            />
          )}
          <Button
            title={poster ? "Poster selected" : "Choose poster"}
            secondary
            disabled={a.busy}
            onPress={() =>
              a.run(async () => {
                const selected = await selectImage("poster");
                if (selected) {
                  small.current.poster?.cancel();
                  delete small.current.poster;
                  setPoster(selected);
                }
              })
            }
          />
          <Button
            title={
              hook
                ? "Discovery hook selected"
                : "Choose optional discovery hook"
            }
            secondary
            disabled={a.busy}
            onPress={() =>
              a.run(async () => {
                const selected = await selectHook();
                if (selected) {
                  small.current.hook?.cancel();
                  delete small.current.hook;
                  setHook(selected);
                }
              })
            }
          />
          <Muted>
            Optional hooks must be H.264/AAC MP4 (or silent), up to 720p, 30
            seconds and 50 MiB. The server checks the uploaded file.
          </Muted>
          {input.poster_asset_id ? (
            <Muted>Poster already uploaded.</Muted>
          ) : null}
          <Notice message={formError ?? a.error} />
          <Button
            title={a.busy ? "Working…" : "Save draft and upload / retry"}
            disabled={a.busy}
            onPress={() => {
              setFormError(null);
              void a.run(upload);
            }}
          />
          {state ? (
            <Panel>
              <Copy>Main film: {state.stage}</Copy>
              <Muted>
                {state.stage === "hashing"
                  ? `Checking complete fingerprint: ${Math.round((100 * state.hashedBytes) / Math.max(1, state.totalBytes))}%`
                  : `Uploaded ${Math.round((100 * state.bytesSent) / Math.max(1, state.totalBytes))}%`}
              </Muted>
              <Notice message={state.error ?? null} />
              <Button
                title="Pause upload"
                secondary
                onPress={() => task.current?.pause()}
              />
              <Button
                title="Discard pending upload"
                secondary
                disabled={a.busy}
                onPress={() =>
                  Alert.alert(
                    "Discard pending upload?",
                    "Uploaded parts will be queued for cleanup. The draft remains.",
                    [
                      { text: "Keep upload", style: "cancel" },
                      {
                        text: "Discard upload",
                        style: "destructive",
                        onPress: () => {
                          void a.run(async () => {
                            await task.current?.discard();
                            task.current = null;
                            setFile(null);
                            setState(null);
                            set("film_asset_id", null);
                            setStage("Upload discarded; cleanup is pending.");
                          });
                        },
                      },
                    ],
                  )
                }
              />
            </Panel>
          ) : null}
          {input.film_asset_id ? (
            <>
              <Button
                title="Refresh processing status"
                secondary
                disabled={a.busy}
                onPress={() => a.run(() => checkProcessing())}
              />
              {processing ? (
                <Copy>
                  Processing: {processing.state}
                  {processing.message ? ` — ${processing.message}` : ""}
                </Copy>
              ) : null}
              {processing?.state === "failed" ? (
                <Button
                  title="Retry server processing"
                  disabled={a.busy}
                  onPress={() =>
                    a.run(async () => {
                      const x = await api!.media.processing.retry(
                        input.film_asset_id!,
                      );
                      if (x.error) throw x.error;
                      await checkProcessing();
                    })
                  }
                />
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <Panel>
          <Copy>
            {input.title} is published. Credits can still be invited below.
          </Copy>
          <Nav
            title="View published film"
            href={{ pathname: "/film/[id]", params: { id: draftId! } }}
          />
        </Panel>
      )}
      {stage ? <Copy>{stage}</Copy> : null}
      {draftId ? (
        <>
          {!published ? (
            <Button
              title="Publish film"
              disabled={
                a.busy ||
                !input.poster_asset_id ||
                (input.source === "r2_native" &&
                  (!input.film_asset_id || processing?.state !== "complete"))
              }
              onPress={() =>
                a.run(async () => {
                  await save(validated());
                  const x = await api!.films.publish(draftId);
                  if (x.error) throw x.error;
                  void api!.index("film", draftId).catch(() => {});
                  router.replace({
                    pathname: "/film/[id]",
                    params: { id: draftId },
                  });
                })
              }
            />
          ) : null}
          <Title>Credit your collaborators</Title>
          <Field
            label="Find a registered creative"
            value={creditQuery}
            onChangeText={setCreditQuery}
          />
          <Field
            label="Credit role or department"
            value={creditRole}
            onChangeText={setCreditRole}
          />
          <Button
            title="Find collaborators"
            disabled={a.busy || creditQuery.trim().length < 2}
            secondary
            onPress={() =>
              a.run(async () => {
                const x = await api!.credits.search(creditQuery);
                if (x.error) throw x.error;
                setCollaborators(
                  (x.data ?? []).map((p) => ({ ...p, id: p.profile_id })),
                );
              })
            }
          />
          {collaborators.map((p) => (
            <Button
              key={p.id}
              title={`Invite ${p.full_name} (@${p.handle})`}
              disabled={a.busy || !creditRole.trim()}
              onPress={() =>
                a.run(async () => {
                  const x = await api!.credits.invite(
                    draftId,
                    p.id,
                    creditRole,
                  );
                  if (x.error) throw x.error;
                  setStage(
                    "Credit invitation sent. Only the recipient can confirm it.",
                  );
                })
              }
            />
          ))}
        </>
      ) : null}
      {draftId ? (
        <>
          <Field
            label="To remove this film, type DELETE FILM"
            value={deletionConfirmation}
            onChangeText={setDeletionConfirmation}
            autoCapitalize="characters"
          />
          <Button
            title="Remove my film"
            secondary
            disabled={a.busy || deletionConfirmation !== "DELETE FILM"}
            onPress={() =>
              Alert.alert("Remove this film?", input.title, [
                { text: "Keep film", style: "cancel" },
                {
                  text: "Remove",
                  style: "destructive",
                  onPress: () => {
                    void a.run(async () => {
                      task.current?.pause();
                      const r = await api!.supabase.rpc("delete_my_film", {
                        p_film: draftId,
                        p_confirmation: deletionConfirmation,
                      });
                      if (r.error) throw r.error;
                      router.replace("/home");
                    });
                  },
                },
              ])
            }
          />
        </>
      ) : null}
      <Muted>
        Uploads are private until server validation and explicit publication. No
        compression percentage is promised while the server works.
      </Muted>
    </Screen>
  );
}
export default function Route() {
  const { draft } = useLocalSearchParams<{ draft?: string }>();
  return (
    <Gate>
      <Publisher key={draft ?? "new"} />
    </Gate>
  );
}
