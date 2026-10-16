import {
  validateUpload,
  validateVideo,
  type VideoMetadata,
} from "./validation.ts";

/** Decode to metadata without reading the whole film into a JavaScript buffer. */
export function inspectVideo(
  file: Blob,
  kind: "film" | "hook",
  signal?: AbortSignal,
): Promise<VideoMetadata> {
  validateUpload(kind, file);
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let timer: ReturnType<typeof setTimeout>;
    const finish = (error?: unknown) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", aborted);
      video.onloadedmetadata = video.onerror = null;
      const metadata = {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      };
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else {
        try {
          validateVideo(kind, metadata);
          resolve(metadata);
        } catch (error) {
          reject(error);
        }
      }
    };
    const aborted = () =>
      finish(new DOMException("Inspection cancelled", "AbortError"));
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => finish();
    video.onerror = () =>
      finish(
        new Error(
          "Browser cannot read this video. Export H.264/AAC MP4 with fast start.",
        ),
      );
    signal?.addEventListener("abort", aborted, { once: true });
    timer = setTimeout(
      () => finish(new Error("Video inspection timed out")),
      15000,
    );
    video.src = url;
  });
}

/** Center-crop profile images; preserve poster aspect ratio. No video transcoding. */
export async function prepareImage(
  file: Blob,
  kind: "profile_picture" | "poster",
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    !file.size ||
    file.size > 20 * 1024 ** 2
  )
    throw new Error("Choose a JPEG, PNG or WebP image up to 20 MiB");
  const bitmap = await createImageBitmap(file);
  try {
    signal?.throwIfAborted();
    const { width, height } = bitmap;
    if (!width || !height || width * height > 40_000_000)
      throw new Error("Choose an image below 40 megapixels");
    const square = kind === "profile_picture";
    const sw = square ? Math.min(width, height) : width;
    const sh = square ? sw : height;
    const scale = Math.min(
      1,
      (square ? 256 : 800) / sw,
      (square ? 256 : 1200) / sh,
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error("Image preparation is unavailable in this browser");
    ctx.drawImage(
      bitmap,
      (width - sw) / 2,
      (height - sh) / 2,
      sw,
      sh,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("Image encoding failed")),
        "image/webp",
        square ? 0.8 : 0.82,
      ),
    );
    signal?.throwIfAborted();
    validateUpload(kind, blob);
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}
