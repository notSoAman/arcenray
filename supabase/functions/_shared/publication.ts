/** Required assets for promotion; a missing optional hook must never block a film. */
export function publicationAssetIds(film: {
  source: string;
  film_asset_id: string | null;
  hook_asset_id: string | null;
  poster_asset_id: string | null;
}): string[] {
  if (!film.poster_asset_id) {
    throw new Error("Upload and verify a poster before publishing.");
  }
  if (film.source === "r2_native" && !film.film_asset_id) {
    throw new Error("Upload and verify the main film before publishing.");
  }
  return [
    film.poster_asset_id,
    ...(film.hook_asset_id ? [film.hook_asset_id] : []),
    ...(film.source === "r2_native" ? [film.film_asset_id!] : []),
  ];
}
