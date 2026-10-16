import { env, HttpError } from "./http.ts";
export async function embed(input: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      dimensions: 1536,
      input: input.slice(0, 12000),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new HttpError(503, "Embedding provider unavailable");
  const data = await response.json();
  const vector = data.data?.[0]?.embedding;
  if (
    !Array.isArray(vector) ||
    vector.length !== 1536 ||
    vector.some((x: unknown) => typeof x !== "number" || !Number.isFinite(x))
  )
    throw new HttpError(503, "Embedding response invalid");
  return vector;
}
