import { publicationAssetIds } from "./publication.ts";
const assert = (ok: boolean) => {
  if (!ok) throw new Error("Assertion failed");
};
Deno.test("native film without hook promotes poster and main film", () => {
  const ids = publicationAssetIds({
    source: "r2_native",
    film_asset_id: "main",
    poster_asset_id: "poster",
    hook_asset_id: null,
  });
  assert(JSON.stringify(ids) === '["poster","main"]');
});
Deno.test("external film without hook promotes only poster", () => {
  for (const source of ["youtube_embed", "vimeo_embed"]) {
    assert(
      JSON.stringify(
        publicationAssetIds({
          source,
          film_asset_id: null,
          poster_asset_id: "poster",
          hook_asset_id: null,
        }),
      ) === '["poster"]',
    );
  }
});
Deno.test("supplied hook is retained for verified promotion", () => {
  assert(
    publicationAssetIds({
      source: "r2_native",
      film_asset_id: "main",
      poster_asset_id: "poster",
      hook_asset_id: "hook",
    }).includes("hook"),
  );
});
Deno.test("poster and native film remain required", () => {
  for (
    const fields of [{ poster_asset_id: null, film_asset_id: "main" }, {
      poster_asset_id: "poster",
      film_asset_id: null,
    }]
  ) {
    let denied = false;
    try {
      publicationAssetIds({
        source: "r2_native",
        hook_asset_id: null,
        ...fields,
      });
    } catch {
      denied = true;
    }
    assert(denied);
  }
});
