import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inspectMp4Moov,
  inspectWebP,
  validateMp4Samples,
} from "./media-inspection.ts";
const tag = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
function join(...parts: Uint8Array[]) {
  const b = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    b.set(p, at);
    at += p.length;
  }
  return b;
}
function int(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
}
function box(type: string, ...parts: Uint8Array[]) {
  const data = join(...parts);
  return join(int(data.length + 8), tag(type), data);
}
function set32(b: Uint8Array, n: number, v: number) {
  new DataView(b.buffer).setUint32(n, v);
}
function moov(
  options: {
    codec?: string;
    width?: number;
    height?: number;
    duration?: number;
    fragmented?: boolean;
    video?: boolean;
    audio?: string;
    videoTables?: Uint8Array[];
    audioTables?: Uint8Array[];
  } = {},
) {
  const mvhd = new Uint8Array(100);
  set32(mvhd, 12, 1000);
  set32(mvhd, 16, options.duration ?? 25000);
  const width = options.width ?? 1920,
    height = options.height ?? 1080,
    tkhd = new Uint8Array(84);
  set32(tkhd, 76, width * 65536);
  set32(tkhd, 80, height * 65536);
  const sample = new Uint8Array(78);
  sample[24] = width >> 8;
  sample[25] = width & 255;
  sample[26] = height >> 8;
  sample[27] = height & 255;
  const handler = new Uint8Array(24);
  handler.set(tag("vide"), 8);
  const stsd = box(
    "stsd",
    int(0),
    int(1),
    box(
      options.codec ?? "avc1",
      sample,
      box("avcC", new Uint8Array([1, 100, 0, 31, 255, 225, 0])),
    ),
  );
  const track = box(
    "trak",
    box("tkhd", tkhd),
    box(
      "mdia",
      box("hdlr", handler),
      box("minf", box("stbl", stsd, ...(options.videoTables ?? []))),
    ),
  );
  const parts = [box("mvhd", mvhd)];
  if (options.video !== false) parts.push(track);
  if (options.fragmented) parts.push(box("mvex"));
  if (options.audio) {
    const handler = new Uint8Array(24);
    handler.set(tag("soun"), 8);
    // ES descriptor -> DecoderConfig (AAC 0x40) -> AudioSpecificConfig (AAC-LC).
    const esds = new Uint8Array([
      0, 0, 0, 0, 3, 22, 0, 1, 0, 4, 17, 0x40, 0x15, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 5, 2, 0x12, 0x10,
    ]);
    const audio = box(options.audio, new Uint8Array(28), box("esds", esds));
    parts.push(
      box(
        "trak",
        box(
          "mdia",
          box("hdlr", handler),
          box(
            "minf",
            box(
              "stbl",
              box("stsd", int(0), int(1), audio),
              ...(options.audioTables ?? []),
            ),
          ),
        ),
      ),
    );
  }
  return box("moov", ...parts);
}
function webp(kind = "VP8 ", width = 256, height = 128) {
  let data: Uint8Array;
  if (kind === "VP8L")
    data = new Uint8Array([
      0x2f,
      (width - 1) & 255,
      ((width - 1) >> 8) | (((height - 1) & 3) << 6),
      ((height - 1) >> 2) & 255,
      ((height - 1) >> 10) & 15,
    ]);
  else {
    data = new Uint8Array(10);
    data.set([
      0,
      0,
      0,
      0x9d,
      1,
      0x2a,
      width & 255,
      width >> 8,
      height & 255,
      height >> 8,
    ]);
  }
  const payload = join(
    tag(kind),
    new Uint8Array([data.length, 0, 0, 0]),
    data,
    new Uint8Array(data.length % 2),
  );
  const result = join(tag("RIFF"), new Uint8Array(4), tag("WEBP"), payload);
  new DataView(result.buffer).setUint32(4, result.length - 8, true);
  return result;
}
test("MP4 accepts H264 metadata and portrait within baseline", () => {
  assert.deepEqual(inspectMp4Moov(moov()), {
    width: 1920,
    height: 1080,
    duration_seconds: 25,
  });
  assert.equal(
    inspectMp4Moov(moov({ width: 1080, height: 1920 })).height,
    1920,
  );
  assert.equal(inspectMp4Moov(moov({ codec: "avc3" })).width, 1920);
  assert.equal(inspectMp4Moov(moov({ audio: "mp4a" })).duration_seconds, 25);
});
test("MP4 rejects incompatible codec, fragmented, missing video and invalid dimensions/duration", () => {
  for (const options of [
    { codec: "hvc1" },
    { fragmented: true },
    { video: false },
    { width: 3840, height: 2160 },
    { width: 0 },
    { duration: 0 },
    { audio: "ac-3" },
  ])
    assert.throws(() => inspectMp4Moov(moov(options)));
});
test("MP4 truncations and forged box sizes fail closed", () => {
  const valid = moov();
  for (const end of [0, 1, 7, 16, valid.length - 1])
    assert.throws(() => inspectMp4Moov(valid.subarray(0, end)));
  const huge = valid.slice();
  set32(huge, 0, 0xffffffff);
  assert.throws(() => inspectMp4Moov(huge));
  const tiny = valid.slice();
  set32(tiny, 0, 4);
  assert.throws(() => inspectMp4Moov(tiny));
  const extended = join(int(1), tag("moov"), new Uint8Array(8));
  set32(extended, 8, 0xffffffff);
  assert.throws(() => inspectMp4Moov(extended));
});
test("WebP decodes lossy and lossless dimensions", () => {
  assert.deepEqual(inspectWebP(webp()), { width: 256, height: 128 });
  assert.deepEqual(inspectWebP(webp("VP8L", 800, 1200)), {
    width: 800,
    height: 1200,
  });
});
test("WebP rejects malformed signatures, RIFF sizes, truncated and missing frames", () => {
  const valid = webp();
  assert.throws(() => inspectWebP(valid.subarray(0, valid.length - 1)));
  const signature = valid.slice();
  signature[0] = 0;
  assert.throws(() => inspectWebP(signature));
  const frame = valid.slice();
  frame[23] = 0;
  assert.throws(() => inspectWebP(frame));
  assert.throws(() => inspectWebP(webp("JUNK")));
});

test("WebP extended canvas must match real frame and reject animation", () => {
  const frame = webp().subarray(12);
  const canvas = new Uint8Array([0, 0, 0, 0, 255, 0, 0, 127, 0, 0]);
  function extended(payload: Uint8Array) {
    const result = join(
      tag("RIFF"),
      new Uint8Array(4),
      tag("WEBP"),
      tag("VP8X"),
      new Uint8Array([10, 0, 0, 0]),
      payload,
      frame,
    );
    new DataView(result.buffer).setUint32(4, result.length - 8, true);
    return result;
  }
  assert.deepEqual(inspectWebP(extended(canvas)), { width: 256, height: 128 });
  const mismatch = canvas.slice();
  mismatch[4] = 254;
  assert.throws(() => inspectWebP(extended(mismatch)));
  const animated = canvas.slice();
  animated[0] = 2;
  assert.throws(() => inspectWebP(extended(animated)));
});

test("MP4 rejects mp4a pretending to contain a non-AAC stream", () => {
  const bytes = moov({ audio: "mp4a" });
  const position = bytes.findIndex(
    (value, index) =>
      value === 0x40 && bytes[index - 2] === 4 && bytes[index - 1] === 17,
  );
  assert.ok(position > 0);
  bytes[position] = 0x69; // MPEG-2 Layer III, despite mp4a sample entry.
  assert.throws(() => inspectMp4Moov(bytes));
});

function sampleTables(
  options: {
    offset?: number;
    co64?: boolean;
    sizes?: number[];
    fixed?: number;
    count?: number;
    samplesPerChunk?: number;
    firstChunk?: number;
  } = {},
) {
  const sizes = options.sizes ?? [4, 6],
    count = options.count ?? sizes.length;
  return [
    box(
      "stsz",
      int(0),
      int(options.fixed ?? 0),
      int(count),
      ...(options.fixed ? [] : sizes.map(int)),
    ),
    box(
      "stsc",
      int(0),
      int(1),
      int(options.firstChunk ?? 1),
      int(options.samplesPerChunk ?? count),
      int(1),
    ),
    box(
      options.co64 ? "co64" : "stco",
      int(0),
      int(1),
      ...(options.co64
        ? [int(0), int(options.offset ?? 1000)]
        : [int(options.offset ?? 1000)]),
    ),
  ];
}
test("sample validation accepts mapped video/audio data and 64-bit offsets", () => {
  validateMp4Samples(moov({ videoTables: sampleTables() }), 2000, [
    { start: 1000, end: 1010 },
  ]);
  validateMp4Samples(
    moov({ videoTables: sampleTables({ co64: true, fixed: 5 }) }),
    2000,
    [{ start: 1000, end: 1010 }],
  );
  validateMp4Samples(
    moov({
      videoTables: sampleTables(),
      audio: "mp4a",
      audioTables: sampleTables({ offset: 1010 }),
    }),
    2000,
    [{ start: 1000, end: 1020 }],
  );
});
test("sample validation rejects metadata-only, missing/empty samples and mdat", () => {
  assert.throws(() =>
    validateMp4Samples(moov(), 2000, [{ start: 1000, end: 1100 }]),
  );
  assert.throws(() =>
    validateMp4Samples(moov({ videoTables: sampleTables() }), 2000, []),
  );
  for (const tables of [
    sampleTables({ sizes: [] }),
    sampleTables({ sizes: [0, 10] }),
    sampleTables({ count: 3 }),
    sampleTables({ firstChunk: 2 }),
    sampleTables({ samplesPerChunk: 1 }),
  ])
    assert.throws(() =>
      validateMp4Samples(moov({ videoTables: tables }), 2000, [
        { start: 1000, end: 1100 },
      ]),
    );
});
test("sample validation rejects out-of-range, overlapping and excessive tables", () => {
  for (const offset of [999, 1001, 2000, 0xffffffff])
    assert.throws(() =>
      validateMp4Samples(
        moov({ videoTables: sampleTables({ offset }) }),
        2000,
        [{ start: 1000, end: 1010 }],
      ),
    );
  assert.throws(() =>
    validateMp4Samples(
      moov({
        videoTables: sampleTables(),
        audio: "mp4a",
        audioTables: sampleTables(),
      }),
      2000,
      [{ start: 1000, end: 1010 }],
    ),
  );
  assert.throws(() =>
    validateMp4Samples(
      moov({ videoTables: sampleTables({ fixed: 1, count: 1000001 }) }),
      2000000,
      [{ start: 1000, end: 1500000 }],
    ),
  );
});
