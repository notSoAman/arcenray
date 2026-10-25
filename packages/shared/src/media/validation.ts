export type MediaKind = "film" | "hook" | "poster" | "profile_picture";
export type VideoMetadata = { width: number; height: number; duration: number };
export const byteLimits: Record<MediaKind, number> = {
  // The host advertises its safe scratch capacity and the reservation RPC is
  // authoritative. R2's per-object ceiling is the outer bound here.
  film: 5 * 1024 ** 4,
  hook: 50 * 1024 ** 2,
  poster: 512 * 1024,
  profile_picture: 100 * 1024,
};

/** Convenience preflight only; trusted validation and quota checks remain on the server. */
export function validateUpload(
  kind: MediaKind,
  blob: { type: string; size: number },
) {
  const mime = kind === "film" || kind === "hook" ? "video/mp4" : "image/webp";
  if (blob.type !== mime) throw new Error(`Choose a ${mime} file`);
  if (blob.size <= 0 || blob.size > byteLimits[kind])
    throw new Error(`File exceeds the ${kind} upload limit or is empty`);
}

export function validateVideo(kind: "film" | "hook", metadata: VideoMetadata) {
  const { width, height, duration } = metadata;
  if (![width, height, duration].every((n) => Number.isFinite(n) && n > 0))
    throw new Error("Could not read valid video dimensions and duration");
  if (kind === "film") return; // the server processor validates and normalizes main films
  const long = kind === "hook" ? 1280 : 1920;
  const short = kind === "hook" ? 720 : 1080;
  if (Math.max(width, height) > long || Math.min(width, height) > short)
    throw new Error(
      `Export the ${kind} at ${kind === "hook" ? "720p" : "1080p"} or lower`,
    );
  if (kind === "hook" && duration > 30)
    throw new Error("Choose a hook of 30 seconds or less");
}
