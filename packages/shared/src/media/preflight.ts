/** Read MP4 container headers without loading the film into memory. This is
 * advisory only: the server probes and decodes the entire uploaded file. */
export interface RangeSource {
  size: number;
  slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> };
}

export const filmRequirements =
  "Choose an MP4 with exactly one video track and at most one audio track. HDR/BT.2020, non-square pixels, dimensions above 8192 pixels, and frame rates above 240 fps are not supported. For best compatibility export SDR H.264/AAC MP4 with square pixels. Subtitles and other data tracks are not retained. The server checks the complete file after upload; available file size depends on current processing capacity.";
export const multipleAudioTracksMessage =
  "This MP4 has multiple audio tracks. Export a version with one audio track (or no audio) before uploading; choose the language you want to keep.";
export const invalidVideoTracksMessage =
  "This MP4 must contain exactly one video track. Export a version with one video track before uploading.";

export type TrackCheck =
  | { status: "checked" }
  | { status: "unsupported"; message: string }
  | { status: "unverified" };

/** Limits seeks as well as memory so malformed or unusual files cannot tie up
 * the UI. Unreadable or nonstandard metadata is explicitly unverified. */
export async function inspectMp4Tracks(
  source: RangeSource,
): Promise<TrackCheck> {
  let reads = 0;
  async function read(start: number, length: number): Promise<Uint8Array> {
    if (
      ++reads > 2048 ||
      start < 0 ||
      length < 0 ||
      start + length > source.size
    )
      throw new Error("unreadable metadata");
    const data = new Uint8Array(
      await source.slice(start, start + length).arrayBuffer(),
    );
    if (data.length !== length) throw new Error("short metadata read");
    return data;
  }
  type Box = { type: string; content: number; end: number };
  async function boxes(start: number, end: number): Promise<Box[]> {
    const result: Box[] = [];
    for (let offset = start; offset < end;) {
      if (end - offset < 8) throw new Error("truncated box");
      const bytes = await read(offset, Math.min(16, end - offset));
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      let length = view.getUint32(0);
      const type = String.fromCharCode(...bytes.subarray(4, 8));
      let header = 8;
      if (length === 1) {
        if (bytes.length < 16) throw new Error("truncated extended box");
        length = view.getUint32(8) * 2 ** 32 + view.getUint32(12);
        header = 16;
      } else if (length === 0) length = end - offset;
      if (
        !Number.isSafeInteger(length) ||
        length < header ||
        length > end - offset
      )
        throw new Error("invalid box size");
      result.push({ type, content: offset + header, end: offset + length });
      offset += length;
    }
    return result;
  }
  try {
    if (!Number.isSafeInteger(source.size) || source.size < 8)
      return { status: "unverified" };
    const roots = await boxes(0, source.size);
    const moovs = roots.filter((box) => box.type === "moov");
    if (
      moovs.length !== 1 ||
      !roots.some((box) => box.type === "ftyp") ||
      !roots.some((box) => box.type === "mdat")
    )
      return { status: "unverified" };
    let video = 0,
      audio = 0;
    const tracks = (await boxes(moovs[0]!.content, moovs[0]!.end)).filter(
      (box) => box.type === "trak",
    );
    if (!tracks.length) return { status: "unverified" };
    for (const track of tracks) {
      const media = (await boxes(track.content, track.end)).filter(
        (box) => box.type === "mdia",
      );
      if (media.length !== 1) return { status: "unverified" };
      const handlers = (await boxes(media[0]!.content, media[0]!.end)).filter(
        (box) => box.type === "hdlr",
      );
      if (handlers.length !== 1 || handlers[0]!.end - handlers[0]!.content < 12)
        return { status: "unverified" };
      const handler = await read(handlers[0]!.content + 8, 4);
      const type = String.fromCharCode(...handler);
      if (type === "vide") video++;
      if (type === "soun") audio++;
    }
    if (audio > 1)
      return {
        status: "unsupported",
        message: multipleAudioTracksMessage,
      };
    if (video !== 1)
      return {
        status: "unsupported",
        message: invalidVideoTracksMessage,
      };
    return { status: "checked" };
  } catch {
    return { status: "unverified" };
  }
}
