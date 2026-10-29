import { admin, checked } from "./http.ts";
import { asset, promote } from "./media-promotion.ts";
import { publicationAssetIds } from "./publication.ts";

/** A single leased publication per poll, using the same verified R2 promotion. */
export async function publishNextFilm() {
  const db = admin();
  const reply = await db.rpc("backend_claim_film_publication");
  if (reply.error) throw Error("Publication queue unavailable");
  if (!reply.data) return;
  const { film, token } = reply.data as {
    film: {
      id: string;
      owner_id: string;
      source: string;
      film_asset_id: string | null;
      hook_asset_id: string | null;
      poster_asset_id: string | null;
    };
    token: string;
  };
  try {
    for (const id of publicationAssetIds(film)) {
      await promote(await asset(id, film.owner_id));
    }
    if (
      !checked(
        await db.rpc("backend_finish_film_publication", {
          p_film: film.id,
          p_token: token,
        }),
      )
    )
      throw Error("Publication changed while preparing");
  } catch {
    const retry = await db.rpc("backend_retry_film_publication", {
      p_film: film.id,
      p_token: token,
    });
    if (retry.error) throw Error("Publication retry could not be saved");
  }
}
