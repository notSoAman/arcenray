import type { FilmDraft } from "./contracts.ts";

export const preferredFilmSource = "youtube_embed";
export const filmLinkOption = "Link a film (YouTube preferred)";
export const filmLinkPlaceholder = "https://www.youtube.com/watch?v=…";
export const filmLinkGuidance =
  "Link an embeddable YouTube upload you have permission to share and save Arcenray storage. Vimeo links also work. If you’re unsure about the rights to music, clips or other material, check before publishing.";
export const nativeFilmGuidance =
  "Upload an MP4 only if you own or have cleared all rights to the film, including music and clips.";

export function filmRightsConfirmation(source: FilmDraft["source"]) {
  return source === "r2_native"
    ? "I own or have cleared all rights to this film, including music and clips, and any poster or discovery clip I upload."
    : "I have permission to share this film and upload any poster or discovery clip I provide.";
}

export function assertFilmRights(
  source: FilmDraft["source"],
  confirmed: boolean,
) {
  if (!confirmed)
    throw new Error(
      source === "r2_native"
        ? "Confirm that you own or have cleared all rights before uploading or publishing."
        : "Confirm that you have permission to share this film and any assets you upload.",
    );
}

export function parseFilmLink(value: string): {
  source: "youtube_embed" | "vimeo_embed";
  provider_id: string;
} {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Use a public HTTPS Vimeo or YouTube video link.");
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1);
  if (["youtube.com", "m.youtube.com"].includes(host))
    id =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : (/^\/(embed|shorts)\/([\w-]+)\/?$/.exec(url.pathname)?.[2] ?? null);
  if (id && /^[A-Za-z0-9_-]{11}$/.test(id))
    return { source: "youtube_embed", provider_id: id };
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    id = /^\/(?:video\/)?(\d+)\/?$/.exec(url.pathname)?.[1] ?? null;
    if (id) return { source: "vimeo_embed", provider_id: id };
  }
  throw new Error("Paste a supported Vimeo video or YouTube watch/share link.");
}
