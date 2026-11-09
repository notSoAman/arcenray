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

Deno.test(
  "publication drain is detached from heartbeats and bounded under backlog",
  async () => {
    const { wakePublications } = await import("./queued-publication.ts");
    const oldFetch = globalThis.fetch,
      oldGet = Deno.env.get;
    const runtime = globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil(p: Promise<unknown>): void };
    };
    const oldRuntime = runtime.EdgeRuntime;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const background: Promise<unknown>[] = [];
    let claimed = 0,
      completed = 0;
    try {
      Deno.env.get = (name) =>
        ({
          SUPABASE_URL: "https://fixture.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "fixture",
        })[name];
      runtime.EdgeRuntime = {
        waitUntil(p) {
          background.push(p);
        },
      };
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        await gate;
        const name = new URL(String(input)).pathname.split("/").at(-1);
        let result: unknown = null;
        if (name === "backend_claim_film_publication") {
          claimed++;
          result = {
            film: {
              id: "film",
              owner_id: "owner",
              source: "youtube_embed",
              film_asset_id: null,
              hook_asset_id: null,
              poster_asset_id: null,
            },
            token: "lease",
          };
        } else if (name === "backend_finish_film_publication") {
          completed++;
          result = true;
        }
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch;
      await wakePublications(); // Must return even while publication's I/O is blocked.
      if (background.length !== 1 || completed !== 0)
        throw Error("Heartbeat blocked by publication");
      release();
      await Promise.all(background);
      if (claimed !== 3 || Number(completed) !== 3)
        throw Error("Publication backlog was not drained within its bound");
    } finally {
      release();
      await Promise.all(background);
      globalThis.fetch = oldFetch;
      Deno.env.get = oldGet;
      runtime.EdgeRuntime = oldRuntime;
    }
  },
);
