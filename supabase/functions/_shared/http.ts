import { createClient } from "@supabase/supabase-js";
import { ZodError } from "zod";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(503, `Server configuration missing: ${name}`);
  return value;
}
export const admin = () =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
export async function auth(req: Request) {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer "))
    throw new HttpError(401, "Authentication required");
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    accessToken: async () => header.slice(7),
  });
  // PostgREST verifies the external issuer/signature before running this RPC.
  // Fail closed before any privileged client or R2 work; never just decode a JWT.
  const { data: id, error } = await client.rpc("current_profile_id");
  if (error || !id) throw new HttpError(401, "A verified account is required");
  return { client, user: { id: String(id) } };
}
export function checked<T>({
  data,
  error,
}: {
  data: T;
  error: { message: string } | null;
}): NonNullable<T> {
  if (error) throw new HttpError(400, error.message);
  if (data === null) throw new HttpError(404, "Not found");
  return data!;
}
export async function rateLimit(
  user: string,
  operation: string,
  limit: number,
) {
  const result = checked(
    await admin().rpc("backend_rate_limit", {
      p_user: user,
      p_operation: operation,
      p_limit: limit,
    }),
  );
  if (!result) throw new HttpError(429, "Hourly request limit reached");
}
export async function jsonBody(req: Request) {
  // Stream with a hard cap; Content-Length is optional/untrusted.
  if (!req.body) throw new HttpError(400, "JSON body required");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 16384) {
        await reader.cancel();
        throw new HttpError(413, "JSON body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    buffer.set(c, at);
    at += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
export function serve(handler: (req: Request) => Promise<unknown>) {
  Deno.serve(async (req) => {
    const origin = req.headers.get("origin");
    const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:3000")
      .split(",")
      .map((x) => x.trim());
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "Access-Control-Allow-Headers":
        "authorization,apikey,content-type,x-client-info,x-cleanup-secret,x-media-processor-secret",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    };
    if (origin && allowed.includes(origin))
      headers["Access-Control-Allow-Origin"] = origin;
    if (origin && !allowed.includes(origin))
      return new Response(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403,
        headers,
      });
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (req.method !== "POST")
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 405,
        headers,
      });
    try {
      return new Response(JSON.stringify(await handler(req)), { headers });
    } catch (error) {
      const status =
        error instanceof HttpError
          ? error.status
          : error instanceof ZodError
            ? 400
            : 500;
      const message =
        error instanceof HttpError
          ? error.message
          : error instanceof ZodError
            ? "Invalid request"
            : "Request failed";
      // Do not log tokens, request bodies or signed URLs.
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers,
      });
    }
  });
}
