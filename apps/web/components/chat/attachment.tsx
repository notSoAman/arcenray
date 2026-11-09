"use client";
import { useEffect, useRef, useState } from "react";
import { browserApi } from "../../lib/client-api";
const limit = 20 * 1024 * 1024;
const types = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-m4a",
  "application/pdf",
  "application/zip",
  "text/plain",
]);
function safeUrl(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    !u.hostname.endsWith(".r2.cloudflarestorage.com") ||
    u.username ||
    u.password ||
    u.port
  )
    throw Error("File link unavailable");
  return u.href;
}
export type ReadyAttachment = { id: string; name: string };
export function ChatAttachment({ id }: { id: string }) {
  const [file, setFile] = useState<{
      url: string;
      name: string;
      content_type: string;
    } | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false);
    void browserApi()
      .chat.attachment.download(id)
      .then((r) => {
        if (!active) return;
        if (r.error || !r.data) throw Error();
        setFile({ ...r.data, url: safeUrl(r.data.url) });
      })
      .catch(() => {
        if (active) setError(true);
      });
    const timer = setTimeout(() => setRetry((x) => x + 1), 240000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, retry]);
  return (
    <div className="chat-attachment">
      {error ? (
        <button type="button" onClick={() => setRetry((x) => x + 1)}>
          Retry loading file
        </button>
      ) : file ? (
        <>
          {file.content_type.startsWith("image/") ? (
            <img
              src={file.url}
              alt={file.name}
              loading="lazy"
              onError={() => setError(true)}
            />
          ) : null}
          {file.content_type.startsWith("audio/") ? (
            <audio
              controls
              preload="none"
              src={file.url}
              onError={() => setError(true)}
            />
          ) : null}
          <a href={file.url} target="_blank" rel="noopener noreferrer">
            {file.name}
          </a>
        </>
      ) : (
        <small>Loading file…</small>
      )}
    </div>
  );
}
export function AttachmentPicker({
  conversationId,
  onReady,
  onBusy,
  disabled,
}: {
  conversationId: string;
  onReady: (file: ReadyAttachment | null) => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    abort = useRef<AbortController | null>(null),
    alive = useRef(true);
  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (timer.current) clearTimeout(timer.current);
  };
  useEffect(() => {
    alive.current = true;
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      alive.current = false;
      stop();
      abort.current?.abort();
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  async function upload(file: File) {
    if (file.size < 1 || file.size > limit) {
      setError("Choose a file up to 20 MB.");
      return;
    }
    setError("");
    setBusy(true);
    onBusy(true);
    onReady(null);
    abort.current = new AbortController();
    try {
      const contentType = types.has(file.type.split(";")[0]!)
        ? file.type.split(";")[0]!
        : "application/octet-stream";
      const api = browserApi().chat.attachment;
      const created = await api.create({
        conversation_id: conversationId,
        name: file.name.slice(0, 180),
        content_type: contentType,
        bytes: file.size,
      });
      if (created.error || !created.data)
        throw Error("Couldn’t start sending this file. Please try again.");
      const response = await fetch(safeUrl(created.data.upload_url), {
        method: "PUT",
        headers: created.data.headers,
        body: file,
        signal: abort.current.signal,
      });
      if (!response.ok)
        throw Error("The file didn’t finish uploading. Please try again.");
      const complete = await api.complete(created.data.asset_id);
      if (complete.error || !complete.data)
        throw Error("Couldn’t confirm the file. Please try again.");
      if (alive.current)
        onReady({ id: complete.data.asset_id, name: file.name });
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error ? cause.message : "Couldn’t send file.",
        );
    } finally {
      if (alive.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  async function record() {
    if (recording) {
      stop();
      return;
    }
    setError("");
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw Error(
          "Voice recording is unavailable in this browser. You can attach an audio file.",
        );
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = mic;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(mic, mime ? { mimeType: mime } : undefined),
        chunks: BlobPart[] = [];
      recorder.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        stop();
        if (!alive.current) return;
        setRecording(false);
        onBusy(false);
        const type = rec.mimeType.split(";")[0] || "audio/webm";
        void upload(
          new File(
            chunks,
            `Voice note.${type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm"}`,
            { type },
          ),
        );
      };
      rec.onerror = () => {
        stop();
        if (alive.current) {
          setRecording(false);
          onBusy(false);
          setError("Recording stopped. Please try again.");
        }
      };
      setRecording(true);
      onBusy(true);
      rec.start();
      timer.current = setTimeout(stop, 120000);
    } catch (cause) {
      stop();
      setError(
        cause instanceof Error
          ? cause.message
          : "Microphone access was not granted.",
      );
    }
  }
  return (
    <div className="chat-attachments-controls">
      <label className="pill">
        {busy ? "Uploading…" : "Attach file"}
        <input
          aria-label="Attach file, image or audio"
          type="file"
          disabled={disabled || busy || recording}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
      </label>
      <button
        className="pill"
        type="button"
        disabled={busy || (disabled && !recording)}
        onClick={() => void record()}
      >
        {recording ? "Stop recording" : "Voice note"}
      </button>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  );
}
