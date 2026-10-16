/** Bounded metadata inspection, not a decoder or proof that every frame is playable. */
export interface Dimensions {
  width: number;
  height: number;
}
function fail(message: string): never {
  throw new Error(`Invalid media: ${message}`);
}
function u32(b: Uint8Array, n: number) {
  if (n < 0 || n + 4 > b.length) fail("truncated integer");
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(n);
}
function four(b: Uint8Array, n: number) {
  if (n + 4 > b.length) fail("truncated tag");
  return String.fromCharCode(...b.subarray(n, n + 4));
}
export function inspectWebP(bytes: Uint8Array): Dimensions {
  if (
    bytes.length < 20 ||
    four(bytes, 0) !== "RIFF" ||
    four(bytes, 8) !== "WEBP"
  )
    fail("WebP RIFF header required");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.length)
    fail("WebP RIFF length mismatch");
  let result: Dimensions | undefined,
    image = false;
  for (let p = 12; p < bytes.length;) {
    if (p + 8 > bytes.length) fail("truncated WebP chunk");
    const tag = four(bytes, p),
      size = view.getUint32(p + 4, true),
      start = p + 8,
      end = start + size;
    if (end > bytes.length || end + (size % 2) > bytes.length)
      fail("truncated WebP payload");
    const b = bytes.subarray(start, end);
    let dimensions: Dimensions | undefined;
    if (tag === "ANIM" || tag === "ANMF")
      fail("animated profile/poster images unsupported");
    if (tag === "VP8X") {
      if (size !== 10 || (b[0]! & 0xc3) !== 0) fail("invalid or animated VP8X");
      const le24 = (n: number) => b[n]! + (b[n + 1]! << 8) + (b[n + 2]! << 16);
      dimensions = { width: le24(4) + 1, height: le24(7) + 1 };
    } else if (tag === "VP8 ") {
      if (image) fail("multiple WebP image chunks");
      if (
        size < 10 ||
        (b[0]! & 1) !== 0 ||
        b[3] !== 0x9d ||
        b[4] !== 0x01 ||
        b[5] !== 0x2a
      )
        fail("invalid VP8 key frame");
      dimensions = {
        width: (b[6]! | (b[7]! << 8)) & 0x3fff,
        height: (b[8]! | (b[9]! << 8)) & 0x3fff,
      };
      image = true;
    } else if (tag === "VP8L") {
      if (image) fail("multiple WebP image chunks");
      if (size < 5 || b[0] !== 0x2f || (b[4]! & 0xe0) !== 0)
        fail("invalid VP8L");
      dimensions = {
        width: 1 + b[1]! + ((b[2]! & 0x3f) << 8),
        height: 1 + (b[2]! >> 6) + (b[3]! << 2) + ((b[4]! & 0xf) << 10),
      };
      image = true;
    }
    if (dimensions) {
      if (dimensions.width <= 0 || dimensions.height <= 0) fail("empty image");
      if (
        result &&
        (result.width !== dimensions.width ||
          result.height !== dimensions.height)
      )
        fail("WebP canvas/frame mismatch");
      result = dimensions;
    }
    p = end + (size % 2);
  }
  if (!result || !image) fail("WebP image chunk missing");
  return result;
}
interface Box {
  type: string;
  payload: Uint8Array;
}
function boxes(bytes: Uint8Array): Box[] {
  const result: Box[] = [];
  for (let p = 0; p < bytes.length;) {
    if (result.length >= 10000 || p + 8 > bytes.length)
      fail("invalid MP4 box list");
    let size = u32(bytes, p),
      header = 8;
    if (size === 1) {
      if (p + 16 > bytes.length) fail("truncated extended box");
      const big =
        BigInt(u32(bytes, p + 8)) * 4294967296n + BigInt(u32(bytes, p + 12));
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) fail("oversized box");
      size = Number(big);
      header = 16;
    }
    if (size === 0) size = bytes.length - p;
    if (size < header || size > bytes.length - p) fail("truncated MP4 box");
    result.push({
      type: four(bytes, p + 4),
      payload: bytes.subarray(p + header, p + size),
    });
    p += size;
  }
  return result;
}
function one(list: Box[], type: string): Uint8Array {
  const matches = list.filter((b) => b.type === type);
  if (matches.length !== 1) fail(`one ${type} required`);
  return matches[0]!.payload;
}
function duration(b: Uint8Array) {
  const version = b[0];
  if (version !== 0 && version !== 1) fail("unsupported mvhd version");
  if (b.length < (version === 0 ? 100 : 112)) fail("truncated movie header");
  const scale = u32(b, version === 0 ? 12 : 20),
    offset = version === 0 ? 16 : 24;
  const ticks =
    version === 0
      ? u32(b, offset)
      : Number(
          BigInt(u32(b, offset)) * 4294967296n + BigInt(u32(b, offset + 4)),
        );
  const seconds = ticks / scale;
  if (!scale || !Number.isFinite(seconds) || seconds <= 0 || seconds > 86400)
    fail("invalid film duration");
  return seconds;
}
function validateAac(entry: Uint8Array) {
  if (entry.length < 28 || entry[8] !== 0 || entry[9] !== 0)
    fail("unsupported audio sample version");
  const esds = one(boxes(entry.subarray(28)), "esds");
  // ISO 14496 descriptor lengths are variable-length, at most four bytes.
  function descriptor(
    at: number,
    end: number,
  ): { tag: number; start: number; end: number } {
    if (at >= end) fail("missing audio descriptor");
    const tag = esds[at++]!;
    let size = 0,
      done = false;
    for (let i = 0; i < 4; i++) {
      if (at >= end) fail("truncated descriptor");
      const n = esds[at++]!;
      size = (size << 7) | (n & 127);
      if (!(n & 128)) {
        done = true;
        break;
      }
    }
    if (!done || at + size > end) fail("invalid descriptor size");
    return { tag, start: at, end: at + size };
  }
  const es = descriptor(4, esds.length);
  if (es.tag !== 3 || es.start + 3 > es.end) fail("ES descriptor required");
  let p = es.start + 3;
  const flags = esds[es.start + 2]!;
  if (flags & 128) p += 2;
  if (flags & 64) {
    if (p >= es.end) fail("truncated ES URL");
    p += 1 + esds[p]!;
  }
  if (flags & 32) p += 2;
  const decoder = descriptor(p, es.end);
  if (
    decoder.tag !== 4 ||
    decoder.end - decoder.start < 13 ||
    esds[decoder.start] !== 0x40
  )
    fail("AAC decoder required");
  const specific = descriptor(decoder.start + 13, decoder.end);
  if (specific.tag !== 5 || specific.end - specific.start < 2)
    fail("AAC config required");
  const audioObjectType = esds[specific.start]! >> 3;
  if (![1, 2, 3, 4, 5, 6, 17, 23, 29, 39].includes(audioObjectType))
    fail("unsupported AAC object type");
}
export function inspectMp4Moov(
  bytes: Uint8Array,
): Dimensions & { duration_seconds: number } {
  if (bytes.length > 16 * 1024 * 1024) fail("moov metadata exceeds limit");
  const root = boxes(bytes);
  const moov = boxes(one(root, "moov"));
  if (root.length !== 1 || moov.some((b) => b.type === "mvex"))
    fail("fragmented MP4 unsupported");
  const duration_seconds = duration(one(moov, "mvhd"));
  let video: Dimensions | undefined;
  for (const track of moov.filter((b) => b.type === "trak")) {
    const parts = boxes(track.payload),
      media = boxes(one(parts, "mdia")),
      handler = one(media, "hdlr");
    const kind = four(handler, 8);
    if (kind !== "vide" && kind !== "soun") fail("unsupported track handler");
    const table = boxes(one(boxes(one(media, "minf")), "stbl")),
      stsd = one(table, "stsd");
    const entries = boxes(stsd.subarray(8));
    if (
      stsd.length < 8 ||
      u32(stsd, 4) !== entries.length ||
      entries.length !== 1
    )
      fail("one sample description required");
    const sample = entries[0]!;
    if (kind === "soun") {
      if (sample.type !== "mp4a") fail("AAC audio required");
      validateAac(sample.payload);
      continue;
    }
    if (video) fail("multiple video tracks unsupported");
    if (!["avc1", "avc3"].includes(sample.type) || sample.payload.length < 78)
      fail("H.264 video required");
    const avc = one(boxes(sample.payload.subarray(78)), "avcC");
    if (avc.length < 7 || avc[0] !== 1) fail("AVC configuration required");
    const tkhd = one(parts, "tkhd");
    const version = tkhd[0];
    if (version !== 0 && version !== 1) fail("unsupported tkhd version");
    const offset = version === 0 ? 76 : 88,
      width = u32(tkhd, offset) / 65536,
      height = u32(tkhd, offset + 4) / 65536;
    // Portrait allows 1080 x 1920; landscape allows 1920 x 1080.
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      Math.max(width, height) > 1920 ||
      Math.min(width, height) > 1080
    )
      fail("video exceeds 1080p dimensions");
    const encodedWidth = (sample.payload[24]! << 8) | sample.payload[25]!,
      encodedHeight = (sample.payload[26]! << 8) | sample.payload[27]!;
    if (
      encodedWidth < 1 ||
      encodedHeight < 1 ||
      Math.max(encodedWidth, encodedHeight) > 1920 ||
      Math.min(encodedWidth, encodedHeight) > 1080
    )
      fail("encoded dimensions exceed 1080p");
    video = { width, height };
  }
  if (!video) fail("video track missing");
  return { ...video, duration_seconds };
}

/** Validate sample byte locations without fetching/decoding mdat. Ranges are [start,end). */
export function validateMp4Samples(
  moov: Uint8Array,
  fileSize: number,
  mdatRanges: { start: number; end: number }[],
): void {
  if (
    !Number.isSafeInteger(fileSize) ||
    fileSize <= 0 ||
    !mdatRanges.length ||
    mdatRanges.length > 128
  )
    fail("nonempty media data required");
  const ranges = [...mdatRanges].sort((a, b) => a.start - b.start);
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]!;
    if (
      !Number.isSafeInteger(range.start) ||
      !Number.isSafeInteger(range.end) ||
      range.start < 0 ||
      range.end <= range.start ||
      range.end > fileSize ||
      (i > 0 && ranges[i - 1]!.end > range.start)
    )
      fail("invalid media data range");
  }
  // Reuse metadata/codec and fragmented-file validation before trusting track tables.
  inspectMp4Moov(moov);
  const tracks = boxes(one(boxes(moov), "moov")).filter(
    (b) => b.type === "trak",
  );
  if (tracks.length > 8) fail("too many tracks");
  let totalSamples = 0,
    totalChunks = 0;
  const extents: { start: number; end: number }[] = [];
  for (const track of tracks) {
    const media = boxes(one(boxes(track.payload), "mdia"));
    const kind = four(one(media, "hdlr"), 8);
    if (kind !== "vide" && kind !== "soun") continue;
    const table = boxes(one(boxes(one(media, "minf")), "stbl"));
    const stsz = one(table, "stsz");
    const fixedSize = u32(stsz, 4),
      sampleCount = u32(stsz, 8);
    totalSamples += sampleCount;
    if (
      !sampleCount ||
      totalSamples > 1_000_000 ||
      stsz.length !== (fixedSize ? 12 : 12 + 4 * sampleCount)
    )
      fail("invalid sample sizes");
    const offsets = table.filter((b) => b.type === "stco" || b.type === "co64");
    if (offsets.length !== 1) fail("one chunk offset table required");
    const offsetBox = offsets[0]!,
      count = u32(offsetBox.payload, 4),
      stride = offsetBox.type === "co64" ? 8 : 4;
    totalChunks += count;
    if (
      !count ||
      totalChunks > 100_000 ||
      offsetBox.payload.length !== 8 + count * stride
    )
      fail("invalid chunk offsets");
    const stsc = one(table, "stsc"),
      entryCount = u32(stsc, 4);
    if (
      !entryCount ||
      entryCount > count ||
      stsc.length !== 8 + 12 * entryCount
    )
      fail("invalid sample-to-chunk table");
    const mappings: { first: number; samples: number }[] = [];
    for (let i = 0; i < entryCount; i++) {
      const p = 8 + i * 12,
        first = u32(stsc, p),
        samples = u32(stsc, p + 4),
        description = u32(stsc, p + 8);
      if (
        (i === 0 && first !== 1) ||
        (i > 0 && first <= mappings[i - 1]!.first) ||
        first > count ||
        !samples ||
        samples > sampleCount ||
        description !== 1
      )
        fail("invalid sample-to-chunk entry");
      mappings.push({ first, samples });
    }
    let sample = 0,
      mapping = 0;
    for (let chunk = 1; chunk <= count; chunk++) {
      if (
        mapping + 1 < mappings.length &&
        mappings[mapping + 1]!.first === chunk
      )
        mapping++;
      const samples = mappings[mapping]!.samples;
      if (sample + samples > sampleCount)
        fail("chunk references nonexistent sample");
      const p = 8 + (chunk - 1) * stride;
      const offset =
        stride === 4
          ? u32(offsetBox.payload, p)
          : Number(
              BigInt(u32(offsetBox.payload, p)) * 4294967296n +
                BigInt(u32(offsetBox.payload, p + 4)),
            );
      if (!Number.isSafeInteger(offset) || offset < 0 || offset >= fileSize)
        fail("chunk offset outside file");
      let bytes = 0;
      if (fixedSize) bytes = fixedSize * samples;
      else
        for (let n = 0; n < samples; n++) {
          const size = u32(stsz, 12 + 4 * (sample + n));
          if (!size) fail("empty media sample");
          bytes += size;
        }
      const end = offset + bytes;
      if (
        !Number.isSafeInteger(end) ||
        end > fileSize ||
        !ranges.some((range) => offset >= range.start && end <= range.end)
      )
        fail("sample bytes outside mdat");
      extents.push({ start: offset, end });
      sample += samples;
    }
    if (sample !== sampleCount) fail("unmapped media samples");
  }
  if (!totalSamples) fail("media samples missing");
  extents.sort((a, b) => a.start - b.start);
  for (let i = 1; i < extents.length; i++)
    if (extents[i]!.start < extents[i - 1]!.end)
      fail("overlapping media chunks");
}
