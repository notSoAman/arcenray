import { strict as assert } from "node:assert";
import {
  createMultipartStorage,
  validateStoredParts,
  FILM_PART_BYTES,
  validatePrivateKey,
} from "./multipart-storage.ts";
const key =
  "50000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000002";
const listing = (ids: string[] = [], truncated = false) =>
  new Response(
    `<ListMultipartUploadsResult><IsTruncated>${truncated}</IsTruncated>${ids.map((id) => `<Upload><Key>${key}</Key><UploadId>${id}</UploadId></Upload>`).join("")}</ListMultipartUploadsResult>`,
  );
Deno.test(
  "multipart rejects unsafe keys and malformed upload IDs before storage I/O",
  async () => {
    let calls = 0;
    const store = createMultipartStorage(async () => {
      calls++;
      return listing();
    });
    assert.throws(() => validatePrivateKey("../foreign"));
    await assert.rejects(store.parts(key, "../?uploadId=other"));
    await assert.rejects(store.initialize("foreign/key"));
    assert.equal(calls, 0);
  },
);
Deno.test(
  "multipart canonical completion requires exact part count, sequence and reserved bytes",
  () => {
    const a = { part_number: 1, bytes: FILM_PART_BYTES, etag: '"abc123"' };
    const b = { part_number: 2, bytes: 7, etag: '"def456"' };
    assert.deepEqual(validateStoredParts(FILM_PART_BYTES + 7, [b, a]), [a, b]);
    for (const parts of [
      [a],
      [a, a],
      [a, { ...b, bytes: 8 }],
      [a, { ...b, part_number: 3 }],
    ])
      assert.throws(() => validateStoredParts(FILM_PART_BYTES + 7, parts));
    assert.throws(() =>
      validateStoredParts(1, [{ ...a, bytes: 1, etag: '"x</ETag>"' }]),
    );
  },
);
Deno.test(
  "multipart initialization recovers one exact-key initiation instead of reserving another",
  async () => {
    const methods: string[] = [];
    const store = createMultipartStorage(async (method) => {
      methods.push(method);
      return listing(["2~existing_upload"]);
    });
    assert.equal(await store.initialize(key), "2~existing_upload");
    assert.deepEqual(methods, ["GET"]);
  },
);
Deno.test(
  "ambiguous unrecorded initiations are aborted before a fresh initiation",
  async () => {
    const calls: string[] = [];
    const store = createMultipartStorage(async (method, _key, query) => {
      calls.push(method + (query.uploadId ? ":" + query.uploadId : ""));
      if (method === "GET") return listing(["2~one", "2~two"]);
      if (method === "DELETE") return new Response(null, { status: 204 });
      return new Response(
        "<InitiateMultipartUploadResult><UploadId>2~new</UploadId></InitiateMultipartUploadResult>",
      );
    });
    assert.equal(await store.initialize(key), "2~new");
    assert.deepEqual(calls, ["GET", "DELETE:2~one", "DELETE:2~two", "POST"]);
  },
);
Deno.test(
  "server ListParts supplies canonical ETags and rejects duplicate/oversize provider parts",
  async () => {
    const part = (n: number, size: number) =>
      `<Part><PartNumber>${n}</PartNumber><Size>${size}</Size><ETag>&quot;abc123&quot;</ETag></Part>`;
    let xml =
      "<ListPartsResult><IsTruncated>false</IsTruncated>" +
      part(1, 20) +
      "</ListPartsResult>";
    const store = createMultipartStorage(async () => new Response(xml));
    await assert.rejects(store.parts(key, "2~bad<id"));
    assert.deepEqual(await store.parts(key, "2~id"), [
      { part_number: 1, bytes: 20, etag: '"abc123"' },
    ]);
    xml =
      "<ListPartsResult><IsTruncated>false</IsTruncated>" +
      part(1, 20) +
      part(1, 20) +
      "</ListPartsResult>";
    await assert.rejects(store.parts(key, "2~id"));
    xml =
      "<ListPartsResult><IsTruncated>false</IsTruncated>" +
      part(1, FILM_PART_BYTES + 1) +
      "</ListPartsResult>";
    await assert.rejects(store.parts(key, "2~id"));
  },
);
Deno.test(
  "missing upload is an explicit ambiguous completion result, not fabricated uploaded parts",
  async () => {
    const store = createMultipartStorage(
      async () =>
        new Response("<Error><Code>NoSuchUpload</Code></Error>", {
          status: 404,
        }),
    );
    assert.equal(await store.parts(key, "2~id"), null);
  },
);
Deno.test(
  "multipart completion sends only validated server ETags and rejects200 XML errors",
  async () => {
    let body: string | undefined;
    const store = createMultipartStorage(async (_method, _key, _q, b) => {
      body = b;
      return new Response("<Error><Code>InvalidPart</Code></Error>");
    });
    await assert.rejects(
      store.complete(key, "2~id", 10, [
        { part_number: 1, bytes: 10, etag: '"abc123"' },
      ]),
    );
    assert.match(body!, /<ETag>&quot;abc123&quot;<\/ETag>/);
  },
);
Deno.test(
  "abort confirms an empty exact-key listing and never treats truncation as complete",
  async () => {
    let reads = 0;
    const calls: string[] = [];
    const store = createMultipartStorage(async (method) => {
      calls.push(method);
      if (method === "GET") return listing(reads++ === 0 ? ["2~one"] : []);
      return new Response(null, { status: 204 });
    });
    await store.abortAll(key);
    assert.deepEqual(calls, ["GET", "DELETE", "GET"]);
    const truncated = createMultipartStorage(async () => listing([], true));
    await assert.rejects(truncated.abortAll(key));
  },
);
