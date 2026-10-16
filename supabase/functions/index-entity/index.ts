import { z } from "zod";
import {
  serve,
  auth,
  admin,
  checked,
  HttpError,
  jsonBody,
  rateLimit,
} from "../_shared/http.ts";
import { embed } from "../_shared/embeddings.ts";
serve(async (req) => {
  const { client, user } = await auth(req);
  const b = z
    .object({ kind: z.enum(["film", "profile"]), id: z.uuid() })
    .strict()
    .parse(await jsonBody(req));
  await rateLimit(user.id, "index", 30);
  let content: string;
  let updatedAt: string;
  if (b.kind === "film") {
    const f = checked(
      await client
        .from("films")
        .select("*")
        .eq("id", b.id)
        .eq("owner_id", user.id)
        .single(),
    );
    const credits = checked(
      await client
        .from("film_credits")
        .select("display_name,role")
        .eq("film_id", f.id)
        .eq("verification_state", "accepted"),
    );
    content = [
      f.title,
      f.synopsis,
      f.genres.join(", "),
      f.mood_tags.join(", "),
      f.location_city,
      f.language,
      ...credits.map((c) => `${c.display_name}: ${c.role}`),
    ]
      .filter(Boolean)
      .join("\n");
    updatedAt = f.updated_at;
  } else {
    if (b.id !== user.id) throw new HttpError(403, "Profile not permitted");
    const p = checked(
      await client.from("profiles").select("*").eq("id", user.id).single(),
    );
    const credits = checked(
      await client
        .from("film_credits")
        .select("display_name,role")
        .eq("profile_id", p.id)
        .eq("verification_state", "accepted"),
    );
    content = [
      p.full_name,
      p.bio,
      p.roles.join(", "),
      p.skills_gear.join(", "),
      p.location_city,
      ...credits.map((c) => c.role),
    ]
      .filter(Boolean)
      .join("\n");
    updatedAt = p.updated_at;
  }
  const vector = await embed(content);
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const saved = checked(
    await admin().rpc("backend_set_embedding", {
      p_kind: b.kind,
      p_id: b.id,
      p_owner: user.id,
      p_embedding: JSON.stringify(vector),
      p_hash: hash,
      p_updated_at: updatedAt,
    }),
  );
  if (!saved)
    throw new HttpError(409, "Content changed during indexing; retry");
  return { indexed: true, kind: b.kind, id: b.id };
});
