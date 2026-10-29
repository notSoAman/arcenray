import { publishNextFilm } from "./queued-publication.ts";

Deno.test(
  "queued publication uses owned verified assets and retries failed commits",
  async () => {
    const oldFetch = globalThis.fetch,
      oldGet = Deno.env.get;
    const env: Record<string, string> = {
      SUPABASE_URL: "https://fixture.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "fixture",
    };
    const film = {
      id: "film",
      owner_id: "owner",
      source: "r2_native",
      film_asset_id: "asset",
      hook_asset_id: null,
      poster_asset_id: null,
    };
    const calls: { name: string; body: Record<string, unknown> }[] = [];
    let hasJob = true,
      finish = true;
    try {
      Deno.env.get = (key) => env[key];
      globalThis.fetch = (async (
        input: RequestInfo | URL,
        options?: RequestInit,
      ) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );
        if (url.origin !== env.SUPABASE_URL)
          throw Error("Ready asset copied again");
        const name = url.pathname.split("/").at(-1)!;
        calls.push({ name, body: JSON.parse(String(options?.body ?? "{}")) });
        const result =
          name === "backend_claim_film_publication"
            ? hasJob
              ? { film, token: "lease" }
              : null
            : name === "backend_asset"
              ? { id: "asset", owner_id: "owner", status: "ready" }
              : name === "backend_finish_film_publication"
                ? finish
                : null;
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch;
      await publishNextFilm();
      if (
        calls.map((x) => x.name).join(",") !==
        "backend_claim_film_publication,backend_asset,backend_finish_film_publication"
      )
        throw Error("Unexpected publication path");
      if (
        calls[1]?.body.p_owner !== "owner" ||
        calls[2]?.body.p_token !== "lease"
      )
        throw Error("Owner/lease not enforced");
      calls.length = 0;
      finish = false;
      await publishNextFilm();
      if (calls.at(-1)?.name !== "backend_retry_film_publication")
        throw Error("Failed publication not retried");
      calls.length = 0;
      hasJob = false;
      await publishNextFilm();
      if (calls.length !== 1) throw Error("Empty queue had side effects");
    } finally {
      globalThis.fetch = oldFetch;
      Deno.env.get = oldGet;
    }
  },
);
