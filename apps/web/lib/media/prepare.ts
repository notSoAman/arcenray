import {
  byteLimits,
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
  // Input resolution is independent of the compact, trusted upload limits.
  if (
    file.type === "image/svg+xml" ||
    (file.type && !file.type.startsWith("image/"))
  )
    throw new Error("Choose a JPEG, PNG, WebP, AVIF, GIF or BMP image.");
  if (!file.size || file.size > 100 * 1024 ** 2)
    throw new Error(
      "Choose a non-empty image up to 100 MiB. It will be resized automatically.",
    );
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "This browser cannot open that image. Try JPEG, PNG or WebP.",
    );
  }
  try {
    signal?.throwIfAborted();
    const { width, height } = bitmap;
    if (!width || !height) throw new Error("Could not read image dimensions");
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
    const encode = (quality: number) =>
      new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error("Image encoding failed")),
          "image/webp",
          quality,
        ),
      );
    const targetBytes = (square ? 25 : 100) * 1024;
    let blob = await encode(square ? 0.8 : 0.82);
    if (blob.type !== "image/webp")
      throw new Error(
        "This browser cannot prepare WebP images. Please use a current browser.",
      );
    for (const quality of [0.74, 0.66, 0.58]) {
      if (blob.size <= targetBytes) break;
      signal?.throwIfAborted();
      blob = await encode(quality);
    }
    // Detailed/noisy artwork can remain large even at a lower quality. Reduce
    // dimensions further rather than sending a blob the server will reject.
    while (
      blob.size > byteLimits[kind] &&
      canvas.width > 64 &&
      canvas.height > 64
    ) {
      const smaller = document.createElement("canvas");
      smaller.width = Math.max(1, Math.round(canvas.width * 0.8));
      smaller.height = Math.max(1, Math.round(canvas.height * 0.8));
      const smallerCtx = smaller.getContext("2d");
      if (!smallerCtx)
        throw new Error("Image preparation is unavailable in this browser");
      smallerCtx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
      canvas.width = smaller.width;
      canvas.height = smaller.height;
      ctx.drawImage(smaller, 0, 0);
      blob = await encode(0.74);
    }
    signal?.throwIfAborted();
    validateUpload(kind, blob);
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}
