// Exercise the actual HTTP handler, not only SQL or the asset-selection helper.
Deno.test("publish HTTP path accepts verified native/external films without a hook", async () => {
  const owner = "59000000-0000-4000-8000-000000000001";
  const filmId = "59000000-0000-4000-8000-000000000002";
  const main = "59000000-0000-4000-8000-000000000003";
  const poster = "59000000-0000-4000-8000-000000000004";
  const env: Record<string, string> = {
    SUPABASE_URL: "https://fixture.supabase.co",
    SUPABASE_ANON_KEY: "fixture-anon",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-service",
    R2_ACCOUNT_ID: "fixture",
    R2_ACCESS_KEY_ID: "fixture",
    R2_SECRET_ACCESS_KEY: "fixture",
    R2_UPLOAD_BUCKET_NAME: "fixture",
    R2_BUCKET_NAME: "fixture",
  };
  const oldServe = Deno.serve,
    oldFetch = globalThis.fetch,
    oldGet = Deno.env.get;
  let handler: (r: Request) => Promise<Response>;
  let source = "r2_native";
  const promoted: string[] = [];
  let published = false;
  const film = () => ({
    id: filmId,
    owner_id: owner,
    status: "draft",
    source,
    film_asset_id: source === "r2_native" ? main : null,
    poster_asset_id: poster,
    hook_asset_id: null,
  });
  try {
    Deno.env.get = (key: string) => env[key];
    Deno.serve = ((h: unknown) => {
      handler = h as typeof handler;
      return {} as ReturnType<typeof Deno.serve>;
    }) as typeof Deno.serve;
    globalThis.fetch =
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
            ? input.href
            : input.url,
        );
        if (url.origin !== env.SUPABASE_URL) {
          throw Error("Unexpected external request");
        }
        const path = url.pathname;
        let data: unknown;
        if (path.endsWith("/rpc/current_profile_id")) data = owner;
        else if (path.endsWith("/rpc/backend_rate_limit")) data = true;
        else if (path.endsWith("/films")) data = film();
        else if (path.endsWith("/profiles")) {
          data = { onboarding_completed: true };
        } else if (path.endsWith("/rpc/backend_asset")) {
          const id = JSON.parse(String(init?.body)).p_id;
          promoted.push(id);
          if (![main, poster].includes(id)) {
            throw Error("Unexpected/null asset lookup");
          }
          data = {
            id,
            owner_id: owner,
            status: "ready",
            kind: id === main ? "film" : "poster",
            public_key: "assets/" + id,
          };
        } else if (path.endsWith("/rpc/publish_film")) {
          published = true;
          data = { ...film(), status: "published" };
        } else throw Error("Unexpected database call: " + path);
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;
    await import("../media-upload/index.ts");
    for (source of ["r2_native", "youtube_embed", "vimeo_embed"]) {
      promoted.length = 0;
      published = false;
      const response = await handler!(
        new Request("https://fixture.supabase.co/functions/v1/media-upload", {
          method: "POST",
          headers: {
            authorization: "Bearer fixture-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({ action: "publish", film_id: filmId }),
        }),
      );
      const body = await response.text();
      if (
        response.status !== 200 || !published || !body.includes('"published"')
      ) throw Error("No-hook publish failed: " + response.status + " " + body);
      if (
        promoted.length !== (source === "r2_native" ? 2 : 1) ||
        !promoted.includes(poster)
      ) throw Error("Wrong verified asset set");
    }
  } finally {
    Deno.serve = oldServe;
    globalThis.fetch = oldFetch;
    Deno.env.get = oldGet;
  }
});
