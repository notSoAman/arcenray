import { z } from "zod";
import { serve, auth, checked, jsonBody, rateLimit } from "../_shared/http.ts";
import { embed } from "../_shared/embeddings.ts";
serve(async (req) => {
  const { client, user } = await auth(req);
  const b = z
    .object({
      query: z.string().trim().min(1).max(500),
      kind: z.enum(["all", "film", "profile"]).default("all"),
      city: z.string().max(100).optional(),
      role: z.string().max(80).optional(),
      genre: z.string().max(80).optional(),
      limit: z.number().int().min(1).max(50).default(20),
    })
    .strict()
    .parse(await jsonBody(req));
  await rateLimit(user.id, "search", 60);
  let vector: number[] | undefined;
  try {
    vector = await embed(b.query);
  } catch {
    /* Full-text is a deliberate provider-outage fallback. */
  }
  const results = checked(
    await client.rpc("hybrid_search", {
      p_query: b.query,
      p_kind: b.kind,
      p_city: b.city,
      p_role: b.role,
      p_genre: b.genre,
      p_limit: b.limit,
      ...(vector ? { p_embedding: JSON.stringify(vector) } : {}),
    }),
  );
  return { results, mode: vector ? "hybrid" : "full_text" };
});
