import { admin, checked } from "./http.ts";
import { asset, promote } from "./media-promotion.ts";
import { publicationAssetIds } from "./publication.ts";

/** Existing worker polls/heartbeats wake a bounded drain independently of encoding.
 * Leases stay in Postgres; a runtime shutdown leaves work recoverable on the next poll.
 */
export async function wakePublications() {
  const work = (async () => {
    const deadline = Date.now() + 30_000;
    for (let count = 0; count < 3 && Date.now() < deadline; count++) {
      if (!(await publishNextFilm())) break;
    }
  })().catch(() => {
    console.warn("publication_poll_failed");
  });
  const runtime = (
    globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void };
    }
  ).EdgeRuntime;
  if (runtime) runtime.waitUntil(work);
  else await work; // Local runtimes without waitUntil must not abandon a lease.
}

/** A single leased publication per poll, using the same verified R2 promotion. */
export async function publishNextFilm() {
  const db = admin();
  const reply = await db.rpc("backend_claim_film_publication");
  if (reply.error) throw Error("Publication queue unavailable");
  if (!reply.data) return false;
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
  return true;
}
