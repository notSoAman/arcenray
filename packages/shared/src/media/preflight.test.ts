import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectMp4Tracks,
  multipleAudioTracksMessage,
  invalidVideoTracksMessage,
  type RangeSource,
} from "./preflight.ts";

function box(type: string, ...contents: Uint8Array[]) {
  const length = 8 + contents.reduce((sum, item) => sum + item.length, 0);
  const out = new Uint8Array(length);
  new DataView(out.buffer).setUint32(0, length);
  out.set(new TextEncoder().encode(type), 4);
  let offset = 8;
  for (const item of contents) {
    out.set(item, offset);
    offset += item.length;
  }
  return out;
}
function track(type: string) {
  const handler = new Uint8Array(12);
  handler.set(new TextEncoder().encode(type), 8);
  return box("trak", box("mdia", box("hdlr", handler)));
}
function sample(...types: string[]): Blob {
  return new Blob(
    [
      box("ftyp"),
      box("mdat", new Uint8Array(4)),
      box("moov", ...types.map(track)),
    ],
    { type: "video/mp4" },
  );
}

test("accepts one video with zero or one audio track", async () => {
  assert.equal((await inspectMp4Tracks(sample("vide"))).status, "checked");
  assert.equal(
    (await inspectMp4Tracks(sample("vide", "soun"))).status,
    "checked",
  );
  assert.equal(
    (await inspectMp4Tracks(sample("vide", "soun", "text"))).status,
    "checked",
  );
});
test("rejects multiple audio or video tracks before upload", async () => {
  const audio = await inspectMp4Tracks(sample("vide", "soun", "soun"));
  assert.equal(audio.status, "unsupported");
  if (audio.status === "unsupported")
    assert.equal(audio.message, multipleAudioTracksMessage);
  const video = await inspectMp4Tracks(sample("vide", "vide"));
  assert.equal(video.status, "unsupported");
  if (video.status === "unsupported")
    assert.equal(video.message, invalidVideoTracksMessage);
});
test("unreadable and incomplete metadata remains explicitly unverified", async () => {
  assert.equal(
    (await inspectMp4Tracks(new Blob([new Uint8Array([1, 2, 3])]))).status,
    "unverified",
  );
  assert.equal(
    (
      await inspectMp4Tracks(
        new Blob([box("ftyp"), box("mdat"), box("moov", box("trak"))]),
      )
    ).status,
    "unverified",
  );
  assert.equal(
    (
      await inspectMp4Tracks({
        size: 100,
        slice() {
          throw new Error("offline provider");
        },
      })
    ).status,
    "unverified",
  );
});
test("skips a multi-gigabyte extended mdat using only bounded header reads", async () => {
  const ftyp = box("ftyp");
  const mdatSize = 5 * 1024 ** 3;
  const mdat = new Uint8Array(16);
  const view = new DataView(mdat.buffer);
  view.setUint32(0, 1);
  mdat.set(new TextEncoder().encode("mdat"), 4);
  view.setUint32(8, Math.floor(mdatSize / 2 ** 32));
  view.setUint32(12, mdatSize % 2 ** 32);
  const moov = box("moov", track("vide"), track("soun"), track("soun"));
  const regions = [
    { offset: 0, data: ftyp },
    { offset: ftyp.length, data: mdat },
    { offset: ftyp.length + mdatSize, data: moov },
  ];
  let maxRead = 0;
  const source: RangeSource = {
    size: ftyp.length + mdatSize + moov.length,
    slice(start, end) {
      maxRead = Math.max(maxRead, end - start);
      return {
        async arrayBuffer() {
          const data = new Uint8Array(end - start);
          for (const r of regions) {
            const a = Math.max(start, r.offset),
              b = Math.min(end, r.offset + r.data.length);
            if (a < b)
              data.set(r.data.subarray(a - r.offset, b - r.offset), a - start);
          }
          return data.buffer;
        },
      };
    },
  };
  assert.equal((await inspectMp4Tracks(source)).status, "unsupported");
  assert.ok(maxRead <= 16);
});
