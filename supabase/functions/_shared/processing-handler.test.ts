Deno.test(
  "processing completion replies are idempotent and stages remain worker-only",
  async () => {
    const job = "61000000-0000-4000-8000-000000000001";
    const token = "61000000-0000-4000-8000-000000000002";
    const oldServe = Deno.serve,
      oldGet = Deno.env.get,
      oldFetch = globalThis.fetch;
    let handler!: (r: Request) => Promise<Response>;
    const calls: string[] = [];
    const env: Record<string, string> = {
      MEDIA_PROCESSOR_SECRET: "fixture-secret",
      SUPABASE_URL: "https://fixture.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "fixture",
    };
    try {
      Deno.env.get = (name) => env[name];
      Deno.serve = ((h: unknown) => {
        handler = h as typeof handler;
        return {} as ReturnType<typeof Deno.serve>;
      }) as typeof Deno.serve;
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        );
        if (url.origin !== env.SUPABASE_URL)
          throw Error("Unexpected R2 operation during replay");
        const name = url.pathname.split("/").at(-1)!;
        calls.push(name);
        const result =
          name === "backend_processing_output"
            ? {
                completed: true,
                output_key: "private-output",
                output_etag: '"output"',
                output_bytes: 100,
                sha256: "a".repeat(64),
              }
            : true;
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch;
      await import("../media-processing/index.ts");
      const send = (body: unknown, secret = "fixture-secret") =>
        handler(
          new Request(
            "https://fixture.supabase.co/functions/v1/media-processing",
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-media-processor-secret": secret,
              },
              body: JSON.stringify(body),
            },
          ),
        );
      const complete = {
        action: "complete",
        job_id: job,
        lease_token: token,
        output_etag: "output",
        output_bytes: 100,
        sha256: "a".repeat(64),
      };
      if ((await send(complete, "wrong")).status !== 401 || calls.length)
        throw Error("Unauthenticated worker reached database");
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await send(complete);
        if (response.status !== 200 || !(await response.json()).completed)
          throw Error("Completion replay failed");
      }
      if (calls.some((name) => name !== "backend_processing_output"))
        throw Error("Replay repeated a write");
      if ((await send({ ...complete, sha256: "b".repeat(64) })).status !== 409)
        throw Error("Changed receipt accepted");
      await send({
        action: "heartbeat",
        job_id: job,
        lease_token: token,
        stage: "encoding",
      });
      if (calls.at(-1) !== "backend_heartbeat_media_processing_progress")
        throw Error("Stage not reported");
      await send({ action: "heartbeat", job_id: job, lease_token: token });
      if (calls.at(-1) !== "backend_heartbeat_media_processing_job")
        throw Error("Legacy worker broken");
      if (
        (
          await send({
            action: "fail",
            job_id: job,
            lease_token: token,
            error: "multiple_tracks",
          })
        ).status !== 200
      )
        throw Error("Safe export error rejected");
      if (
        (
          await send({
            action: "fail",
            job_id: job,
            lease_token: token,
            error: "secret URL",
          })
        ).status !== 400
      )
        throw Error("Arbitrary error text accepted");
    } finally {
      Deno.serve = oldServe;
      Deno.env.get = oldGet;
      globalThis.fetch = oldFetch;
    }
  },
);
