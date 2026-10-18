import { test } from "node:test";
import assert from "node:assert/strict";
import { copiedHeadSnapshot, copyResultEtag } from "./r2.ts";

test("CopyObject result pins destination ETag independently of original multipart ETag", () => {
  const etag = copyResultEtag(
    "<CopyObjectResult><ETag>&quot;bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&quot;</ETag></CopyObjectResult>",
  );
  assert.equal(etag, '"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"');
  assert.deepEqual(
    copiedHeadSnapshot(
      new Response(null, {
        headers: { etag, "content-length": "128", "content-type": "video/mp4" },
      }),
      etag,
      128,
      "video/mp4",
    ),
    { etag, bytes: 128, contentType: "video/mp4" },
  );
  for (const headers of [
    {
      etag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-6"',
      "content-length": "128",
      "content-type": "video/mp4",
    },
    { etag, "content-length": "129", "content-type": "video/mp4" },
    { etag, "content-length": "128", "content-type": "image/webp" },
  ]) {
    assert.throws(() =>
      copiedHeadSnapshot(
        new Response(null, { headers }),
        etag,
        128,
        "video/mp4",
      ),
    );
  }
});
test("embedded copy errors, missing/ambiguous ETags and header injection fail closed", () => {
  for (const body of [
    "<Error><Code>AccessDenied</Code></Error>",
    "<CopyObjectResult/>",
    "<ETag>aaaa</ETag><ETag>bbbb</ETag>",
    '<ETag>"aaaa\r\nX-Header: true"</ETag>',
  ])
    assert.throws(() => copyResultEtag(body));
});
