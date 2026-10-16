import { HttpError } from "./http.ts";

// Supabase Edge Runtime supplies this API; ordinary Deno/Node does not run inference.
// Narrow local typing avoids adding a runtime dependency solely for ambient types.
declare const Supabase: {
  ai: {
    Session: new (model: "gte-small") => {
      run(
        input: string,
        options: { mean_pool: true; normalize: true },
      ): Promise<unknown>;
    };
  };
};
const model = new Supabase.ai.Session("gte-small");

export async function embed(input: string): Promise<number[]> {
  let vector: unknown;
  try {
    // English only. The model truncates input to 512 tokens, not 512 characters.
    vector = await model.run(input, { mean_pool: true, normalize: true });
  } catch {
    throw new HttpError(503, "Embedding runtime unavailable");
  }
  if (
    !Array.isArray(vector) ||
    vector.length !== 384 ||
    vector.some((x: unknown) => typeof x !== "number" || !Number.isFinite(x))
  )
    throw new HttpError(503, "Embedding response invalid");
  return vector;
}
