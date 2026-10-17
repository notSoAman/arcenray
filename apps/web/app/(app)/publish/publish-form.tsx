"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { filmDraftSchema, type Database, type FilmDraft } from "@repo/shared";
import { browserApi } from "../../../lib/client-api";
import { inspectVideo, prepareImage } from "../../../lib/media/prepare";
import { createUploadTask, type UploadState } from "../../../lib/media/upload";
import styles from "./publish.module.css";
import { parseFilmLink } from "./film-link";

type Film = Database["public"]["Tables"]["films"]["Row"];
type Kind = "film" | "hook" | "poster";
type Task = ReturnType<typeof createUploadTask>;
type Slot = {
  name: string;
  task: Task;
  state: UploadState;
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
const labels = (value: string) =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
}: {
  initial: Film | null;
  drafts: Film[];
  handle: string;
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
  const [genreText, setGenreText] = useState(form.genres.join(", "));
  const [moodText, setMoodText] = useState(form.mood_tags.join(", "));
  const [externalUrl, setExternalUrl] = useState(
    initial?.provider_id
      ? initial.source === "youtube_embed"
        ? `https://www.youtube.com/watch?v=${initial.provider_id}`
        : `https://vimeo.com/${initial.provider_id}`
      : "",
  );
  const [slots, setSlots] = useState<Partial<Record<Kind, Slot>>>({});
  const tasks = useRef<Partial<Record<Kind, Task>>>({});
  const active = useRef<Task | null>(null);
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
  const [storage, setStorage] = useState<{
    quota_bytes: number;
    used_bytes: number;
    reserved_bytes: number;
  } | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [rights, setRights] = useState(false);
  const patch = (value: Partial<FilmDraft>) =>
    setForm((current) => ({ ...current, ...value }));
  async function refreshStorage() {
    const reply = await browserApi().media.storage();
    if (
      reply.error ||
      !reply.data ||
      typeof reply.data !== "object" ||
      Array.isArray(reply.data)
    ) {
      setStorageError(true);
      return;
    }
    const data = reply.data;
    if (
      ![data.quota_bytes, data.used_bytes, data.reserved_bytes].every(
        (v) => typeof v === "number" && Number.isFinite(v),
      )
    ) {
      setStorageError(true);
      return;
    }
    setStorage(data as typeof storage);
    setStorageError(false);
  }
  useEffect(() => {
    void refreshStorage().catch(() => setStorageError(true));
    return () => {
      for (const task of Object.values(tasks.current)) task?.cancel();
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

  async function choose(kind: Kind, file?: File) {
    if (!file) return;
    setPreparing(kind);
    setError("");
    try {
      let blob: Blob = file;
      let description = "";
      if (kind === "poster") {
        const prepared = await prepareImage(file, "poster");
        blob = prepared.blob;
        description = `${prepared.width} × ${prepared.height} WebP · ${size(blob.size)}`;
      } else {
        const metadata = await inspectVideo(file, kind);
        description = `${metadata.width} × ${metadata.height} · ${metadata.duration.toFixed(1)} seconds · ${size(file.size)}`;
        if (kind === "film" && (file.size * 8) / metadata.duration > 4_500_000)
          description +=
            " · High bitrate: consider an H.264/AAC, CRF 22 export for a smaller upload.";
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
      genres: labels(genreText),
      mood_tags: labels(moodText),
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
    if (busy || preparing) return;
    setBusy(true);
    setError("");
    setNotice("");
    cancelled.current = false;
    setUploading(true);
    try {
      let value = input();
      await persist(value); // Save metadata first, before any upload reservation.
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
      const freshBytes = Object.entries(tasks.current).reduce(
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
      const kinds: Kind[] =
        value.source === "r2_native"
          ? ["film", "hook", "poster"]
          : ["hook", "poster"];
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
        "Draft saved privately. All selected files are verified. Review your details, then publish.",
      );
    } catch (err) {
      setError(message(err));
    } finally {
      active.current = null;
      setUploading(false);
      setBusy(false);
      void refreshStorage().catch(() => setStorageError(true));
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
    if (busy || preparing) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = input();
      if (!rights)
        throw new Error(
          "Confirm that you have permission to publish the film, hook and poster.",
        );
      if (
        !value.hook_asset_id ||
        !value.poster_asset_id ||
        (value.source === "r2_native" && !value.film_asset_id)
      )
        throw new Error(
          "Save and upload your film, hook and poster before publishing.",
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
      setBusy(false);
    }
  }
  const locked = busy || preparing !== null || published;
  return (
    <div className={styles.layout}>
      <section className={styles.editor} aria-label="Film editor">
        <div className={styles.storage}>
          <strong>Your storage</strong>
          {storage ? (
            <span>
              {size(storage.used_bytes)} used · {size(storage.reserved_bytes)}{" "}
              reserved · {size(storage.quota_bytes)} total
            </span>
          ) : (
            <span>
              {storageError
                ? "Storage unavailable. Server quota checks still apply."
                : "Loading storage…"}
            </span>
          )}
          <button
            type="button"
            onClick={() =>
              void refreshStorage().catch(() => setStorageError(true))
            }
          >
            Refresh storage
          </button>
        </div>
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
            <div className={styles.row}>
              <label>
                Genres (comma separated)
                <input
                  value={genreText}
                  onChange={(e) => setGenreText(e.target.value)}
                />
              </label>
              <label>
                Moods (comma separated)
                <input
                  value={moodText}
                  onChange={(e) => setMoodText(e.target.value)}
                />
              </label>
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
                <input
                  maxLength={80}
                  value={form.language ?? ""}
                  onChange={(e) => patch({ language: e.target.value || null })}
                />
              </label>
            </div>
          </fieldset>
          <fieldset disabled={locked} className={styles.fields}>
            <legend>2 / Film & discovery assets</legend>
            <label>
              Film source
              <select
                value={form.source === "r2_native" ? "native" : "external"}
                onChange={(e) =>
                  patch(
                    e.target.value === "native"
                      ? { source: "r2_native", provider_id: null }
                      : { source: "vimeo_embed", film_asset_id: null },
                  )
                }
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
                  Playback uses the provider’s embed. Supply your own hook and
                  poster below.
                </small>
              </label>
            )}
            <p className={styles.muted}>
              MP4 with H.264/AAC and fast start. Main film: up to 1080p / 2 GiB.
              Hook: up to 720p / 30 seconds / 50 MiB. Export your chosen hook in
              your editor; browser video conversion is not enabled.
            </p>
            {(["film", "hook", "poster"] as Kind[])
              .filter((kind) => kind !== "film" || form.source === "r2_native")
              .map((kind) => (
                <div key={kind} className={styles.asset}>
                  <label>
                    {kind === "film"
                      ? "Main film MP4"
                      : kind === "hook"
                        ? "Discovery hook MP4 (required)"
                        : "Poster (required)"}
                    <input
                      type="file"
                      accept={
                        kind === "poster"
                          ? "image/jpeg,image/png,image/webp"
                          : "video/mp4"
                      }
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
                Cancel upload
              </button>
            )}
          </div>
          <p className={styles.muted}>
            Uploads travel directly to storage. Keep this tab open while
            uploading. Retry here to reuse a valid reservation. Saved drafts
            survive a reload; unfinished local files must be selected again.
            Abandoned reservations are cleaned up automatically.
          </p>
        </form>
        <section className={styles.publish}>
          <h2>3 / Ready for your audience?</h2>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={rights}
              disabled={locked}
              onChange={(e) => setRights(e.target.checked)}
            />
            I have the rights or permission to publish this film, hook and
            poster.
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
                    setBusy(true);
                    setError("");
                    void index(draftId)
                      .catch((err) => setError(message(err)))
                      .finally(() => setBusy(false));
                  }}
                >
                  Retry indexing
                </button>
              )}
            </div>
          </div>
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
