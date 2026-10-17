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
