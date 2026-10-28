/** Promote only supplied, verified assets; posters and hooks are both optional. */
export function publicationAssetIds(film: {
  source: string;
  film_asset_id: string | null;
  hook_asset_id: string | null;
  poster_asset_id: string | null;
}): string[] {
  if (film.source === "r2_native" && !film.film_asset_id) {
    throw new Error("Upload and verify the main film before publishing.");
  }
  return [
    ...(film.poster_asset_id ? [film.poster_asset_id] : []),
    ...(film.hook_asset_id ? [film.hook_asset_id] : []),
    ...(film.source === "r2_native" ? [film.film_asset_id!] : []),
  ];
}
