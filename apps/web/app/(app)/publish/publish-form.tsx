"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { filmDraftSchema, type Database, type FilmDraft } from "@repo/shared";
import { DeleteFilm } from "../../../components/delete-film";
import { FilmCreditsEditor } from "../../../components/film-credits-editor";
import { browserApi } from "../../../lib/client-api";
import { inspectVideo, prepareImage } from "../../../lib/media/prepare";
import { multipartCheckpoint } from "../../../lib/media/multipart-checkpoint";
import {
  createMultipartUploadTask,
  parseMultipartDescriptor,
  type MultipartDescriptor,
  type MultipartState,
} from "../../../lib/media/multipart-upload";
import { createUploadTask, type UploadState } from "../../../lib/media/upload";
import styles from "./publish.module.css";
import { parseFilmLink } from "./film-link";
import { FILM_GENRES, FILM_LANGUAGES } from "./film-options";

type Film = Database["public"]["Tables"]["films"]["Row"];
type Kind = "film" | "hook" | "poster";
type Task = ReturnType<typeof createUploadTask>;
type Slot = {
  name: string;
  task?: Task;
  state: UploadState | MultipartState;
  description: string;
};
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
const assetField = {
  film: "film_asset_id",
  hook: "hook_asset_id",
  poster: "poster_asset_id",
} as const;
const size = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The request failed. Please retry.";
}

export function PublishForm({
  initial,
  drafts,
  handle,
  viewerId,
}: {
  initial: Film | null;
  drafts: Film[];
  handle: string;
  viewerId: string;
}) {
  const [form, setForm] = useState<FilmDraft>(() =>
    initial
      ? {
          title: initial.title,
          synopsis: initial.synopsis,
          genres: initial.genres,
          mood_tags: initial.mood_tags,
          location_city: initial.location_city,
          language: initial.language,
          source: initial.source as FilmDraft["source"],
          provider_id: initial.provider_id,
          film_asset_id: initial.film_asset_id,
          hook_asset_id: initial.hook_asset_id,
          poster_asset_id: initial.poster_asset_id,
        }
      : empty,
  );
  const [draftId, setDraftId] = useState(initial?.id ?? null);
  const savedId = useRef(initial?.id ?? null);
  const [externalUrl, setExternalUrl] = useState(
    initial?.provider_id
      ? initial.source === "youtube_embed"
        ? `https://www.youtube.com/watch?v=${initial.provider_id}`
        : `https://vimeo.com/${initial.provider_id}`
      : "",
  );
  const [slots, setSlots] = useState<Partial<Record<Kind, Slot>>>({});
  const tasks = useRef<Partial<Record<Kind, Task>>>({});
  const active = useRef<{ cancel(): void } | null>(null);
  const mainFile = useRef<File | null>(null);
  const mainTask = useRef<ReturnType<typeof createMultipartUploadTask> | null>(
    null,
  );
  const operation = useRef(false);
  const [pendingUploads, setPendingUploads] = useState<MultipartDescriptor[]>(
    [],
  );
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState(
    Boolean(initial?.id && initial.status === "draft"),
  );
  const [resumeError, setResumeError] = useState("");
  const [discardConfirmation, setDiscardConfirmation] = useState("");
  const [fileVersion, setFileVersion] = useState(0);
  const cancelled = useRef(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preparing, setPreparing] = useState<Kind | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    initial?.status === "published" ? "This film is already published." : "",
  );
  const [published, setPublished] = useState(initial?.status === "published");
  const [indexed, setIndexed] = useState(false);
  const [rights, setRights] = useState(false);
  const patch = (value: Partial<FilmDraft>) =>
    setForm((current) => ({ ...current, ...value }));
  useEffect(() => {
    return () => {
      for (const task of Object.values(tasks.current)) task?.cancel();
      mainTask.current?.pause();
    };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  async function loadPending(id: string) {
    const reply = await browserApi().media.multipart.list(id);
    if (
      reply.error ||
      !reply.data ||
      typeof reply.data !== "object" ||
      !("uploads" in reply.data) ||
      !Array.isArray(reply.data.uploads)
    )
      throw new Error(
        "Could not check resumable film uploads. Your saved draft is safe. Retry before starting or replacing a film upload.",
      );
    const descriptors = reply.data.uploads.map(parseMultipartDescriptor);
    if (
      new Set(descriptors.map((item) => item.asset_id)).size !==
        descriptors.length ||
      descriptors.some((item) => item.draft_id !== id)
    )
      throw new Error("Invalid draft upload response");
    const checkpointPort = multipartCheckpoint(viewerId, id);
    const saved = await checkpointPort.read();
    if (saved?.asset_id) {
      let known = descriptors.find((item) => item.asset_id === saved.asset_id);
      if (!known) {
        const state = await browserApi().media.multipart.status(saved.asset_id);
        if (state.error)
          throw new Error(
            "Could not reconcile the saved upload checkpoint. Retry before creating a replacement.",
          );
        known = parseMultipartDescriptor(state.data);
        if (known.asset_id !== saved.asset_id || known.draft_id !== id)
          throw new Error("Invalid saved upload response");
        descriptors.push(known);
      }
      if (known.status === "aborted") {
        await checkpointPort.clear();
        if (
          mainTask.current?.state.assetId === known.asset_id &&
          mainTask.current.state.stage !== "complete"
        ) {
          mainTask.current = null;
          mainFile.current = null;
          setSlots((previous) => {
            const next = { ...previous };
            delete next.film;
            return next;
          });
          setFileVersion((version) => version + 1);
          setDiscardConfirmation("");
        }
      }
    }
    const candidates = descriptors.filter(
      (item) =>
        item.status !== "aborted" &&
        !(
          item.asset_id === form.film_asset_id &&
          ["uploaded", "ready"].includes(item.status)
        ),
    );
    setPendingUploads(candidates);
    setResumeId((previous) =>
      candidates.some((item) => item.asset_id === previous)
        ? previous
        : candidates.length === 1
          ? candidates[0]!.asset_id
          : null,
    );
    setResumeError("");
    return candidates;
  }
  useEffect(() => {
    if (!initial?.id || initial.status !== "draft") return;
    let alive = true;
    // Checkpoint ownership is scoped to the current authenticated application UUID.
    void loadPending(initial.id)
      .catch((err) => {
        if (alive) setResumeError(message(err));
      })
      .finally(() => {
        if (alive) setResumeLoading(false);
      });
    return () => {
      alive = false;
    };
    // The keyed server entry remounts when a different draft is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id]);

  async function choose(kind: Kind, file?: File) {
    if (!file || operation.current || busy || preparing) return;
    operation.current = true;
    setPreparing(kind);
    setError("");
    try {
      let blob: Blob = file;
      let description = "";
      if (kind === "poster") {
        const prepared = await prepareImage(file, "poster");
        blob = prepared.blob;
        description = `${prepared.width} × ${prepared.height} WebP · ${Math.ceil(blob.size / 1024)} KB (automatically prepared)`;
      } else {
        const metadata = await inspectVideo(file, kind);
        description = `${metadata.width} × ${metadata.height} · ${metadata.duration.toFixed(1)} seconds · ${size(file.size)}`;
        if (kind === "film" && (file.size * 8) / metadata.duration > 4_500_000)
          description +=
            " · High bitrate: consider an H.264/AAC, CRF 22 export for a smaller upload.";
      }
      if (kind === "film") {
        mainTask.current?.pause();
        mainTask.current = null;
        mainFile.current = file;
        setSlots((previous) => ({
          ...previous,
          film: {
            name: file.name,
            description,
            state: {
              stage: "idle",
              bytesSent: 0,
              totalBytes: file.size,
              hashedBytes: 0,
            },
          },
        }));
        setNotice(
          "Film checked. Save draft & upload will check the complete file fingerprint before resuming any saved parts.",
        );
        return;
      }
      tasks.current[kind]?.cancel();
      const task = createUploadTask(kind, blob, browserApi().media, (state) =>
        setSlots((previous) =>
          previous[kind]
            ? { ...previous, [kind]: { ...previous[kind]!, state } }
            : previous,
        ),
      );
      tasks.current[kind] = task;
      setSlots((previous) => ({
        ...previous,
        [kind]: { name: file.name, task, state: task.state, description },
      }));
      patch({ [assetField[kind]]: null });
      setNotice(
        "File checked. Save draft & upload to send it directly to media storage.",
      );
    } catch (err) {
      setError(message(err));
    } finally {
      operation.current = false;
      setPreparing(null);
    }
  }

  function input(): FilmDraft {
    const source =
      form.source === "r2_native"
        ? { source: "r2_native" as const, provider_id: null }
        : parseFilmLink(externalUrl);
    return filmDraftSchema.parse({
      ...form,
      ...source,
      film_asset_id: source.source === "r2_native" ? form.film_asset_id : null,
    });
  }
  async function persist(value: FilmDraft): Promise<string> {
    const reply = savedId.current
      ? await browserApi().films.updateDraft(savedId.current, value)
      : await browserApi().films.createDraft(value);
    if (reply.error || !reply.data)
      throw new Error(
        "Could not save the draft. Your form and uploaded files are retained here; retry saving.",
      );
    savedId.current = reply.data.id;
    setDraftId(reply.data.id);
    window.history.replaceState(null, "", `/publish?draft=${reply.data.id}`);
    return reply.data.id;
  }
  async function save() {
    if (busy || preparing || operation.current || resumeLoading) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    cancelled.current = false;
    setUploading(true);
    try {
      let value = input();
      const id = await persist(value); // Save metadata first, before any upload reservation.
      let resumable: MultipartDescriptor | undefined;
      let mainFreshBytes = 0;
      if (
        value.source === "r2_native" &&
        mainFile.current &&
        !mainTask.current
      ) {
        const candidates = await loadPending(id);
        resumable =
          candidates.find((item) => item.asset_id === resumeId) ??
          (candidates.length === 1 ? candidates[0] : undefined);
        if (candidates.length && !resumable)
          throw new Error(
            "Choose the saved upload to resume or explicitly discard it before starting another film.",
          );
        const checkpoint = await multipartCheckpoint(viewerId, id).read();
        // A checkpoint without an asset ID may follow a committed but lost create response.
        // Never count that existing reservation twice; server quota remains final authority.
        if (!resumable && !checkpoint) mainFreshBytes = mainFile.current.size;
      }
      const quota = await browserApi().media.storage();
      if (
        quota.error ||
        !quota.data ||
        typeof quota.data !== "object" ||
        Array.isArray(quota.data)
      )
        throw new Error(
          "Could not check storage. Your draft is saved; retry before uploading.",
        );
      const remaining =
        Number(quota.data.quota_bytes) -
        Number(quota.data.used_bytes) -
        Number(quota.data.reserved_bytes);
      const freshBytes =
        mainFreshBytes +
        Object.entries(tasks.current).reduce(
          (total, [kind, task]) =>
            (kind !== "film" || value.source === "r2_native") &&
            task?.state.stage === "idle"
              ? total + task.state.totalBytes
              : total,
          0,
        );
      if (!Number.isFinite(remaining) || freshBytes > remaining)
        throw new Error(
          "These files exceed your available storage. Choose smaller exports or wait for abandoned reservations to clear.",
        );
      if (value.source === "r2_native" && mainFile.current) {
        if (!mainTask.current)
          mainTask.current = createMultipartUploadTask(
            mainFile.current,
            browserApi().media.multipart,
            {
              draftId: id,
              existing: resumable,
              checkpoint: multipartCheckpoint(viewerId, id),
              onChange: (state) =>
                setSlots((previous) =>
                  previous.film
                    ? { ...previous, film: { ...previous.film, state } }
                    : previous,
                ),
            },
          );
        if (cancelled.current)
          throw new Error(
            "Upload paused. Resume it in this tab or reselect the same film after reopening this draft.",
          );
        active.current = mainTask.current;
        const receipt = await mainTask.current.start();
        value = { ...value, film_asset_id: receipt.asset_id };
        patch({ film_asset_id: receipt.asset_id });
        await persist(value);
        setPendingUploads((previous) =>
          previous.filter((item) => item.asset_id !== receipt.asset_id),
        );
        setResumeId(null);
      }
      const kinds: Kind[] = ["hook", "poster"];
      for (const kind of kinds) {
        if (cancelled.current)
          throw new Error(
            "Upload paused. Retry Save draft & upload in this tab to reuse your reservation.",
          );
        const task = tasks.current[kind];
        if (!task) continue;
        active.current = task;
        const receipt = await task.start();
        value = { ...value, [assetField[kind]]: receipt.asset_id };
        patch({ [assetField[kind]]: receipt.asset_id });
        await persist(value); // Persist each verified receipt so later failures do not lose it.
      }
      setNotice(
        pendingUploads.length && !mainFile.current
          ? "Draft saved privately. Reselect the original film below to resume its pending upload."
          : "Draft saved privately. All selected files are verified. Review your details, then publish.",
      );
    } catch (err) {
      setError(message(err));
    } finally {
      active.current = null;
      setUploading(false);
      operation.current = false;
      setBusy(false);
    }
  }
  async function index(id: string) {
    const reply = await browserApi().index("film", id);
    if (reply.error)
      throw new Error(
        "Your film is published. Search indexing could not finish; retry indexing below.",
      );
    setIndexed(true);
  }
  async function publish() {
    if (busy || preparing || operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = input();
      if (value.source === "r2_native" && (resumeLoading || resumeError))
        throw new Error(
          "Refresh saved uploads successfully before publishing this film.",
        );
      if (
        value.source === "r2_native" &&
        ((mainFile.current && mainTask.current?.state.stage !== "complete") ||
          pendingUploads.some((item) => item.asset_id !== value.film_asset_id))
      )
        throw new Error(
          "Finish or explicitly discard the pending film upload before publishing.",
        );
      if (!rights)
        throw new Error(
          "Confirm that you have permission to publish the film, poster and any optional hook.",
        );
      if (
        !value.poster_asset_id ||
        (value.source === "r2_native" && !value.film_asset_id)
      )
        throw new Error(
          "Save and upload your film and poster before publishing.",
        );
      const id = await persist(value);
      const reply = await browserApi().films.publish(id);
      if (reply.error) {
        // A timed-out response can follow a committed publication. Read back before retrying.
        const check = await browserApi().films.get(id);
        if (check.error || check.data?.status !== "published")
          throw new Error(
            "Publication could not be confirmed. Your draft is saved; retry, or check your profile before trying again.",
          );
      }
      setPublished(true);
      setNotice("Your film is published and available to watch.");
      await index(id);
    } catch (err) {
      setError(message(err));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function discardMain() {
    if (
      operation.current ||
      busy ||
      preparing ||
      discardConfirmation !== "DISCARD UPLOAD"
    )
      return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      const id = savedId.current;
      if (!id) throw new Error("Save the draft before managing its upload.");
      const selected = pendingUploads.find(
        (item) => item.asset_id === resumeId,
      );
      let status: "aborting" | "aborted";
      if (mainTask.current) status = await mainTask.current.discard();
      else if (selected) {
        const reply = await browserApi().media.multipart.abort(
          selected.asset_id,
        );
        if (
          reply.error ||
          !reply.data ||
          typeof reply.data !== "object" ||
          !("status" in reply.data) ||
          !["aborting", "aborted"].includes(String(reply.data.status))
        )
          throw new Error(
            "Discard could not be confirmed. Retry; your upload may still be reserved.",
          );
        status = reply.data.status === "aborted" ? "aborted" : "aborting";
        if (status === "aborted") {
          const port = multipartCheckpoint(viewerId, id),
            stored = await port.read();
          if (stored?.asset_id === selected.asset_id) await port.clear();
        }
      } else
        throw new Error(
          "Choose the pending upload to discard, or reselect its original film to recover the checkpoint.",
        );
      if (status === "aborted") {
        mainTask.current = null;
        mainFile.current = null;
        setSlots((previous) => {
          const next = { ...previous };
          delete next.film;
          return next;
        });
        setFileVersion((version) => version + 1);
        setDiscardConfirmation("");
        setResumeId(null);
        await loadPending(id);
        setNotice("Upload discarded. Select a film to start a new upload.");
      } else
        setNotice(
          "Discard queued. Storage remains reserved until cleanup is confirmed. Refresh saved uploads to check progress before choosing a replacement.",
        );
    } catch (err) {
      setError(message(err));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  const locked = busy || preparing !== null || published || resumeLoading;
  return (
    <div className={styles.layout}>
      <section className={styles.editor} aria-label="Film editor">
        {!published && draftId && (
          <section
            className={styles.resumePanel}
            aria-label="Saved film uploads"
          >
            <h2>Resumable film upload</h2>
            {resumeLoading ? (
              <p role="status">Checking saved uploads…</p>
            ) : resumeError ? (
              <div>
                <p role="alert" className={styles.error}>
                  {resumeError}
                </p>
                <p>
                  If a local recovery hint is unreadable, forget it and reload
                  the server’s saved uploads. This does not discard remote parts
                  or release storage.
                </p>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy || resumeLoading}
                  onClick={() => {
                    if (operation.current) return;
                    operation.current = true;
                    setBusy(true);
                    void (async () => {
                      await multipartCheckpoint(viewerId, draftId).clear();
                      mainTask.current?.pause();
                      mainTask.current = null;
                      mainFile.current = null;
                      setSlots((previous) => {
                        const next = { ...previous };
                        delete next.film;
                        return next;
                      });
                      setFileVersion((version) => version + 1);
                      await loadPending(draftId);
                    })()
                      .catch((err) => setResumeError(message(err)))
                      .finally(() => {
                        operation.current = false;
                        setBusy(false);
                      });
                  }}
                >
                  Forget local recovery hint & reload
                </button>
              </div>
            ) : pendingUploads.length ? (
              <>
                <label>
                  Saved upload
                  <select
                    value={resumeId ?? ""}
                    disabled={busy}
                    onChange={(event) => {
                      setResumeId(event.target.value || null);
                      mainTask.current?.pause();
                      mainTask.current = null;
                      mainFile.current = null;
                      setSlots((previous) => {
                        const next = { ...previous };
                        delete next.film;
                        return next;
                      });
                      setFileVersion((version) => version + 1);
                    }}
                  >
                    <option value="">Choose an upload</option>
                    {pendingUploads.map((item) => (
                      <option value={item.asset_id} key={item.asset_id}>
                        {size(item.bytes)} · {item.status} ·{" "}
                        {item.asset_id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
                {pendingUploads
                  .filter((item) => item.asset_id === resumeId)
                  .map((item) => (
                    <div key={item.asset_id}>
                      <p>
                        {size(item.bytes)} · {item.status}. Resume before{" "}
                        {new Date(item.resume_expires_at).toLocaleString()}.
                      </p>
                      <p className={styles.fingerprint}>
                        File fingerprint: {item.fingerprint}
                      </p>
                      <p>
                        Reselect the original Main film MP4 below, then Save
                        draft & upload. Every byte is fingerprint-checked before
                        saved parts are reused.
                      </p>
                    </div>
                  ))}
              </>
            ) : (
              <p>
                {mainTask.current?.state.assetId &&
                mainTask.current.state.stage !== "complete"
                  ? "A film upload is reserved in this tab. Resume it below or explicitly discard it."
                  : "No pending upload was found for this draft."}
              </p>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy || resumeLoading}
              onClick={() => {
                setResumeLoading(true);
                void loadPending(draftId)
                  .catch((err) => setResumeError(message(err)))
                  .finally(() => setResumeLoading(false));
              }}
            >
              Refresh saved uploads
            </button>
            {(pendingUploads.length > 0 ||
              (mainTask.current?.state.assetId &&
                mainTask.current.state.stage !== "complete")) && (
              <div className={styles.discard}>
                <p>
                  Discard permanently abandons these uploaded film parts. Your
                  draft metadata stays saved. Quota may remain reserved while
                  server cleanup finishes.
                </p>
                <label>
                  Type DISCARD UPLOAD to confirm
                  <input
                    value={discardConfirmation}
                    disabled={busy}
                    onChange={(event) =>
                      setDiscardConfirmation(event.target.value)
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy || discardConfirmation !== "DISCARD UPLOAD"}
                  onClick={() => void discardMain()}
                >
                  Discard saved upload
                </button>
              </div>
            )}
          </section>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={locked} className={styles.fields}>
            <legend>1 / Tell us about your film</legend>
            <label>
              Film title
              <input
                required
                maxLength={200}
                value={form.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </label>
            <label>
              Synopsis
              <textarea
                maxLength={5000}
                rows={5}
                value={form.synopsis}
                onChange={(e) => patch({ synopsis: e.target.value })}
              />
            </label>
            <div className={styles.genreField}>
              <span id="film-genres-label">Genres</span>
              <details className={styles.genreDropdown}>
                <summary
                  aria-labelledby="film-genres-label film-genres-selection"
                  aria-disabled={locked}
                >
                  <span id="film-genres-selection">
                    {form.genres.length
                      ? form.genres.join(", ")
                      : "Select genres"}
                  </span>
                </summary>
                <div
                  className={styles.genreOptions}
                  role="group"
                  aria-labelledby="film-genres-label"
                >
                  {[...new Set([...FILM_GENRES, ...form.genres])].map(
                    (genre) => (
                      <label key={genre}>
                        <input
                          type="checkbox"
                          checked={form.genres.includes(genre)}
                          disabled={
                            locked ||
                            (!form.genres.includes(genre) &&
                              form.genres.length >= 8)
                          }
                          onChange={(e) =>
                            patch({
                              genres: e.target.checked
                                ? [...form.genres, genre]
                                : form.genres.filter(
                                    (value) => value !== genre,
                                  ),
                            })
                          }
                        />
                        {genre}
                      </label>
                    ),
                  )}
                </div>
              </details>
              <small>Select up to 8 genres.</small>
            </div>
            <div className={styles.row}>
              <label>
                City
                <input
                  maxLength={100}
                  value={form.location_city ?? ""}
                  onChange={(e) =>
                    patch({ location_city: e.target.value || null })
                  }
                />
              </label>
              <label>
                Language
                <select
                  value={form.language ?? ""}
                  onChange={(e) => patch({ language: e.target.value || null })}
                >
                  <option value="">Select a language</option>
                  {[
                    ...new Set([
                      ...FILM_LANGUAGES,
                      ...(form.language ? [form.language] : []),
                    ]),
                  ].map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
          <fieldset disabled={locked} className={styles.fields}>
            <legend>2 / Film & discovery assets</legend>
            <label>
              Film source
              <select
                value={form.source === "r2_native" ? "native" : "external"}
                onChange={(e) => {
                  if (
                    pendingUploads.length ||
                    (mainTask.current?.state.assetId &&
                      !["complete", "aborted"].includes(
                        mainTask.current.state.stage,
                      ))
                  ) {
                    setError(
                      "Resume or discard the pending film upload before changing its source.",
                    );
                    return;
                  }
                  patch(
                    e.target.value === "native"
                      ? { source: "r2_native", provider_id: null }
                      : { source: "vimeo_embed", film_asset_id: null },
                  );
                }}
              >
                <option value="native">Upload my film (recommended)</option>
                <option value="external">Link Vimeo or YouTube</option>
              </select>
            </label>
            {form.source !== "r2_native" && (
              <label>
                Vimeo or YouTube link
                <input
                  type="url"
                  required
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://vimeo.com/123456789"
                />
                <small>
                  Playback uses the provider’s embed. Supply your poster below;
                  a discovery hook is optional.
                </small>
              </label>
            )}
            <p className={styles.muted}>
              MP4 with H.264/AAC and fast start. Main film: up to 1080p / 2 GiB.
              Optional hook: up to 720p / 30 seconds / 50 MiB. Export your
              chosen hook in your editor; browser video conversion is not
              enabled.
            </p>
            <p className={styles.muted}>
              No hook? Your film will appear in Loop with its poster and
              details.
            </p>
            {(["film", "hook", "poster"] as Kind[])
              .filter((kind) => kind !== "film" || form.source === "r2_native")
              .map((kind) => (
                <div key={kind} className={styles.asset}>
                  <label>
                    {kind === "film"
                      ? pendingUploads.length || mainTask.current?.state.assetId
                        ? "Reselect original Main film MP4 to resume"
                        : "Main film MP4"
                      : kind === "hook"
                        ? "Discovery hook MP4 (optional)"
                        : "Poster (required)"}
                    <input
                      key={kind === "film" ? fileVersion : kind}
                      type="file"
                      disabled={
                        kind === "film" &&
                        (resumeLoading || Boolean(resumeError))
                      }
                      accept={kind === "poster" ? "image/*" : "video/mp4"}
                      onChange={(e) => void choose(kind, e.target.files?.[0])}
                    />
                  </label>
                  {slots[kind] ? (
                    <>
                      <p>{slots[kind]!.name}</p>
                      <small>{slots[kind]!.description}</small>
                      <p aria-live="polite">
                        {slots[kind]!.state.stage === "idle"
                          ? "Ready to upload"
                          : slots[kind]!.state.stage}
                      </p>
                      {kind === "film" &&
                        slots.film &&
                        "hashedBytes" in slots.film.state &&
                        slots.film.state.stage === "hashing" && (
                          <p>
                            Checking complete file fingerprint:{" "}
                            {size(slots.film.state.hashedBytes)} of{" "}
                            {size(slots.film.state.totalBytes)}. No film bytes
                            have been uploaded in this step.
                          </p>
                        )}
                      <progress
                        value={slots[kind]!.state.bytesSent}
                        max={slots[kind]!.state.totalBytes}
                        aria-label={`${kind} upload progress`}
                      />
                      {slots[kind]!.state.error && (
                        <p className={styles.error}>
                          {slots[kind]!.state.error}
                        </p>
                      )}
                    </>
                  ) : form[assetField[kind]] ? (
                    <p className={styles.success}>
                      Verified asset saved with this draft. Choose a file only
                      to replace it.
                    </p>
                  ) : (
                    <small>
                      {kind === "poster"
                        ? "JPEG, PNG or WebP. Prepared as WebP up to 800 × 1200 before upload."
                        : "No file selected yet."}
                    </small>
                  )}
                </div>
              ))}
          </fieldset>
          {preparing && <p role="status">Checking {preparing}…</p>}
          <div className={styles.actions}>
            <button className="btn btn-ghost" type="submit" disabled={locked}>
              Save draft & upload
            </button>
            {busy && uploading && !published && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  cancelled.current = true;
                  active.current?.cancel();
                }}
              >
                Pause uploads
              </button>
            )}
          </div>
          <p className={styles.muted}>
            Uploads travel directly to storage. Main films use resumable parts.
            Pause to preserve transferred film parts; reopen this draft and
            reselect the identical film before its displayed resume deadline.
            Hooks and posters use single uploads and may need to restart after a
            reload. Discard is a separate action; storage remains reserved until
            cleanup is confirmed.
          </p>
        </form>
        {draftId ? (
          <FilmCreditsEditor
            key={draftId}
            filmId={draftId}
            viewerId={viewerId}
            editable={!locked}
          />
        ) : (
          <p className={styles.muted}>
            Save your draft to add your collaborators’ film credits.
          </p>
        )}
        <section className={styles.publish}>
          <h2>3 / Ready for your audience?</h2>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={rights}
              disabled={locked}
              onChange={(e) => setRights(e.target.checked)}
            />
            I have the rights or permission to publish this film, poster and any
            optional discovery hook.
          </label>
          <button
            type="button"
            className="btn btn-accent"
            disabled={locked || !rights}
            onClick={() => void publish()}
          >
            Publish film
          </button>
        </section>
        {notice && (
          <p role="status" className={styles.success}>
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {published && draftId && (
          <div className={styles.result}>
            <h2>Your film is live.</h2>
            <p>
              {indexed
                ? "Search indexing completed."
                : "Your film can be watched now. Indexing has not been confirmed in this tab; retry it if needed."}
            </p>
            <div className={styles.actions}>
              <Link className="btn btn-primary" href={`/watch/${draftId}`}>
                Watch film
              </Link>
              <Link className="btn btn-ghost" href={`/u/${handle}`}>
                View profile
              </Link>
              <Link className="btn btn-ghost" href="/loop">
                Open Loop
              </Link>
              {!indexed && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    if (operation.current || busy) return;
                    operation.current = true;
                    setBusy(true);
                    setError("");
                    void index(draftId)
                      .catch((err) => setError(message(err)))
                      .finally(() => {
                        operation.current = false;
                        setBusy(false);
                      });
                  }}
                >
                  Retry indexing
                </button>
              )}
            </div>
          </div>
        )}
        {draftId && (
          <DeleteFilm
            filmId={draftId}
            title={form.title}
            disabled={busy || preparing !== null}
            onBusyChange={(value) => {
              operation.current = value;
              setBusy(value);
            }}
          />
        )}
      </section>
      <aside className={styles.sidebar}>
        <p className="kicker">Your drafts</p>
        <h2>Pick up where you left off.</h2>
        <button
          type="button"
          disabled={busy || preparing !== null}
          className={styles.newDraft}
          onClick={() => window.location.assign("/publish")}
        >
          + New film
        </button>
        {drafts.length ? (
          drafts.map((draft) => (
            <Link
              aria-current={draft.id === draftId ? "page" : undefined}
              className={styles.draft}
              key={draft.id}
              href={`/publish?draft=${draft.id}`}
              onClick={(event) => {
                if (busy || preparing) {
                  event.preventDefault();
                  setError(
                    "Wait for the upload to finish or cancel it before switching drafts.",
                  );
                }
              }}
            >
              {draft.title}
              <small>
                Private draft ·{" "}
                {new Date(draft.updated_at).toLocaleDateString("en-GB")}
              </small>
            </Link>
          ))
        ) : (
          <p className={styles.muted}>Your saved drafts will appear here.</p>
        )}
        <p className={styles.muted}>
          Publish only work you can share. Credit attribution and verification
          are separate from publication; this editor does not grant verified
          credits.
        </p>
      </aside>
    </div>
  );
}
