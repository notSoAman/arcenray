"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Avatar } from "./media";
import { browserApi } from "../lib/client-api";
import { prepareImage } from "../lib/media/prepare";
import { createUploadTask } from "../lib/media/upload";
import styles from "./profile-photo-picker.module.css";

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp";
const VIEW = 320;

export function ProfilePhotoPicker({
  name,
  picKey,
  onUploaded,
  disabled = false,
}: {
  name: string;
  picKey?: string | null;
  onUploaded: (key: string) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(
    null,
  );
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [fileName, setFileName] = useState("");
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  useEffect(() => () => bitmap?.close(), [bitmap]);
  useEffect(() => {
    if (!bitmap) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        bitmap.close();
        setBitmap(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [bitmap, busy]);
  useEffect(() => {
    if (!bitmap || !canvas.current) return;
    const ctx = canvas.current.getContext("2d");
    if (!ctx) return;
    const side = Math.min(bitmap.width, bitmap.height) / zoom;
    const x = Math.max(
      0,
      Math.min(bitmap.width - side, (center?.x ?? bitmap.width / 2) - side / 2),
    );
    const y = Math.max(
      0,
      Math.min(
        bitmap.height - side,
        (center?.y ?? bitmap.height / 2) - side / 2,
      ),
    );
    ctx.clearRect(0, 0, VIEW, VIEW);
    ctx.drawImage(bitmap, x, y, side, side, 0, 0, VIEW, VIEW);
  }, [bitmap, center, zoom]);

  async function choose(file?: File) {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      setError("Choose a JPEG, PNG, WebP, AVIF, GIF or BMP image.");
      return;
    }
    if (!file.size || file.size > 100 * 1024 ** 2) {
      setError("Choose an image smaller than 100 MiB.");
      return;
    }
    try {
      const next = await createImageBitmap(file);
      setBitmap((previous) => {
        previous?.close();
        return next;
      });
      setFileName(file.name);
      setCenter({ x: next.width / 2, y: next.height / 2 });
      setZoom(1);
    } catch {
      setError(
        "This browser could not open that image. Try JPEG, PNG or WebP.",
      );
    }
  }

  function beginDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (!bitmap) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      cx: center?.x ?? bitmap.width / 2,
      cy: center?.y ?? bitmap.height / 2,
    };
  }
  function moveDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (!bitmap || !drag.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const sourcePerPixel =
      Math.min(bitmap.width, bitmap.height) / zoom / bounds.width;
    setCenter({
      x: Math.max(
        0,
        Math.min(
          bitmap.width,
          drag.current.cx - (event.clientX - drag.current.x) * sourcePerPixel,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          bitmap.height,
          drag.current.cy - (event.clientY - drag.current.y) * sourcePerPixel,
        ),
      ),
    });
  }

  async function uploadCrop() {
    if (!bitmap || !canvas.current || busy) return;
    setBusy(true);
    setError("");
    try {
      setProgress("Preparing your photo…");
      const cropped = await new Promise<Blob>((resolve, reject) =>
        canvas.current!.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("Could not crop this image.")),
          "image/webp",
          0.84,
        ),
      );
      const prepared = await prepareImage(cropped, "profile_picture");
      const receipt = await createUploadTask(
        "profile_picture",
        prepared.blob,
        browserApi().media,
        (state) => {
          setProgress(
            state.stage === "uploading"
              ? "Uploading photo…"
              : state.stage === "verifying"
                ? "Finishing up…"
                : "Preparing your photo…",
          );
        },
      ).start();
      if (receipt.status !== "ready" || !receipt.public_key)
        throw new Error("The photo is still being processed. Please retry.");
      onUploaded(receipt.public_key);
      bitmap.close();
      setBitmap(null);
      setFileName("");
      setProgress("Profile photo updated.");
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Could not upload your photo. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.row}>
        <Avatar picKey={picKey} name={name} size={64} />
        <div>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={disabled || busy}
            onClick={() => input.current?.click()}
          >
            {picKey ? "Change photo" : "Add profile photo"}
          </button>
          <p className={styles.hint}>
            Choose a photo, then crop and zoom before it uploads.
          </p>
        </div>
      </div>
      <input
        ref={input}
        className={styles.hidden}
        type="file"
        accept={ACCEPT}
        disabled={disabled || busy}
        onChange={(event) => {
          void choose(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      {progress && (
        <p className={styles.status} role="status">
          {progress}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {bitmap &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={styles.overlay}
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !busy)
                setBitmap(null);
            }}
          >
            <section
              className={styles.dialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="profile-crop-title"
            >
              <h2 id="profile-crop-title">Crop your profile photo</h2>
              <p>Drag to position. Use the slider to zoom in.</p>
              <canvas
                ref={canvas}
                width={VIEW}
                height={VIEW}
                className={styles.crop}
                aria-label="Photo crop preview"
                onPointerDown={beginDrag}
                onPointerMove={moveDrag}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
              />
              <label className={styles.zoom}>
                Zoom{" "}
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                />
              </label>
              <span className={styles.hint}>{fileName}</span>
              <div className={styles.actions}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    bitmap.close();
                    setBitmap(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-accent"
                  disabled={busy}
                  onClick={() => void uploadCrop()}
                >
                  {busy ? progress || "Uploading…" : "Use this photo"}
                </button>
              </div>
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
