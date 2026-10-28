import { File, Directory, Paths, FileMode, UploadType } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as Crypto from "expo-crypto";
import {
  createMultipartUploadTask,
  type MultipartCheckpoint,
  type MultipartCheckpointPort,
  type UploadChunk,
  type MultipartTransport,
  type MultipartState,
} from "@repo/shared/media";
import { createUploadTask } from "@repo/shared/media-upload";
import { inspectMp4Tracks } from "@repo/shared/media-preflight";
import { uuidSchema } from "@repo/shared";
import type { Api } from "./session";

/** Expo File.slice() reads the entire file. This adapter uses bounded native reads. */
class NativeRange implements UploadChunk {
  constructor(
    readonly file: File,
    readonly start: number,
    readonly size: number,
    readonly type: string,
  ) {}
  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.size > 16 * 1024 ** 2)
      throw new Error("Use a bounded native read");
    const handle = this.file.open(FileMode.ReadOnly);
    try {
      handle.offset = this.start;
      const bytes = await handle.readBytes(this.size);
      if (bytes.length !== this.size)
        throw new Error("File changed or became unavailable");
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
    } finally {
      handle.close();
    }
  }
}
class NativeSource extends NativeRange {
  constructor(file: File, type: string) {
    super(file, 0, file.size, type);
  }
  slice(start: number, end: number, type = this.type) {
    return new NativeRange(
      this.file,
      start,
      Math.max(0, Math.min(this.size, end) - start),
      type,
    );
  }
}
const nativeTransport: MultipartTransport = async (
  url,
  headers,
  chunk,
  signal,
  onProgress,
) => {
  if (!(chunk instanceof NativeRange))
    throw new Error("Expected a native file range");
  const destination = new URL(url);
  if (
    destination.protocol !== "https:" ||
    !destination.hostname.endsWith(".r2.cloudflarestorage.com") ||
    destination.username ||
    destination.password ||
    destination.port ||
    destination.hash
  )
    throw new Error("Invalid upload destination");
  const temp = new File(Paths.cache, `arcenray-part-${Crypto.randomUUID()}`);
  if (Paths.availableDiskSpace < chunk.size + 64 * 1024 ** 2)
    throw new Error("Not enough temporary disk space for one upload part");
  temp.create();
  try {
    const input = chunk.file.open(FileMode.ReadOnly);
    try {
      const output = temp.open(FileMode.WriteOnly);
      try {
        input.offset = chunk.start;
        for (let sent = 0; sent < chunk.size;) {
          signal.throwIfAborted();
          const bytes = await input.readBytes(
            Math.min(1024 ** 2, chunk.size - sent),
          );
          if (!bytes.length)
            throw new Error("Selected file is no longer readable");
          await output.writeBytes(bytes);
          sent += bytes.length;
        }
      } finally {
        output.close();
      }
    } finally {
      input.close();
    }
    signal.throwIfAborted();
    const response = await temp.upload(url, {
      httpMethod: "PUT",
      uploadType: UploadType.BINARY_CONTENT,
      headers: { "Content-Type": headers["Content-Type"]! },
      signal,
      onProgress: (p) => onProgress(p.bytesSent),
    });
    if (response.status < 200 || response.status >= 300)
      throw new Error("Storage transfer failed");
  } finally {
    if (temp.exists) temp.delete();
  }
};
function checkpoint(profile: string, draft: string): MultipartCheckpointPort {
  uuidSchema.parse(profile);
  uuidSchema.parse(draft);
  const dir = new Directory(Paths.document, "multipart", profile);
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `${draft}.json`);
  return {
    async read() {
      if (!file.exists) return null;
      const value = JSON.parse(await file.text()) as MultipartCheckpoint;
      return value;
    },
    async write(value) {
      const safe = {
        request_id: value.request_id,
        asset_id: value.asset_id,
        draft_id: value.draft_id,
        fingerprint: value.fingerprint,
        bytes: value.bytes,
      };
      if (!file.exists) file.create();
      file.write(JSON.stringify(safe));
    },
    async clear() {
      if (file.exists) file.delete();
    },
  };
}
export async function selectFilm() {
  const r = await DocumentPicker.getDocumentAsync({
    type: "video/mp4",
    copyToCacheDirectory: false,
    multiple: false,
  });
  if (r.canceled) return null;
  const picked = r.assets[0]!;
  if (
    !picked.name.toLowerCase().endsWith(".mp4") ||
    (picked.mimeType && picked.mimeType !== "video/mp4")
  )
    throw new Error("Select an MP4 film");
  const file = new File(picked.uri);
  if (!file.size || file.size > 5 * 1024 ** 4)
    throw new Error("Selected file has invalid size");
  const tracks = await inspectMp4Tracks(new NativeSource(file, "video/mp4"));
  if (tracks.status === "unsupported") throw new Error(tracks.message);
  return {
    name: picked.name,
    file,
    tracksChecked: tracks.status === "checked",
  };
}
export function mainFilmTask(
  file: File,
  api: Api,
  profile: string,
  draft: string,
  onChange: (state: Readonly<MultipartState>) => void,
) {
  return createMultipartUploadTask(
    new NativeSource(file, "video/mp4"),
    api.media.multipart,
    {
      draftId: draft,
      checkpoint: checkpoint(profile, draft),
      transport: nativeTransport,
      digest: (b) => Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, b),
      randomId: Crypto.randomUUID,
      rehashOnStart: true,
      onChange,
    },
  );
}
export async function selectImage(kind: "poster" | "profile_picture") {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled) return null;
  const asset = result.assets[0]!;
  if (
    asset.width * asset.height > 40_000_000 ||
    (asset.fileSize ?? 0) > 20 * 1024 ** 2
  )
    throw new Error("Choose a smaller image");
  const context = ImageManipulator.manipulate(asset.uri);
  let width = asset.width,
    height = asset.height;
  if (kind === "profile_picture") {
    const side = Math.min(width, height);
    context.crop({
      originX: Math.floor((width - side) / 2),
      originY: Math.floor((height - side) / 2),
      width: side,
      height: side,
    });
    width = side;
    height = side;
  }
  const ratio = Math.min(
    1,
    (kind === "poster" ? 800 : 256) / width,
    (kind === "poster" ? 1200 : 256) / height,
  );
  context.resize({
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.WEBP,
    compress: kind === "poster" ? 0.82 : 0.8,
  });
  const file = new File(saved.uri);
  if (file.size > (kind === "poster" ? 512 * 1024 : 100 * 1024))
    throw new Error("Image is still too large. Use a simpler image.");
  return file;
}
export async function selectHook() {
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    allowsEditing: false,
    videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
  });
  if (r.canceled) return null;
  const a = r.assets[0]!;
  const file = new File(a.uri);
  if (
    (a.duration ?? 0) <= 0 ||
    (a.duration ?? 0) > 30000 ||
    Math.max(a.width, a.height) > 1280 ||
    Math.min(a.width, a.height) > 720 ||
    file.size > 50 * 1024 ** 2 ||
    !a.uri.toLowerCase().endsWith(".mp4")
  )
    throw new Error("Choose a <=30 second, <=720p MP4 hook under 50 MiB");
  return file;
}
export function smallMediaTask(
  file: File,
  kind: "poster" | "profile_picture" | "hook",
  api: Api,
  onChange?: Parameters<typeof createUploadTask>[3],
) {
  return createUploadTask(
    kind,
    new NativeSource(file, kind === "hook" ? "video/mp4" : "image/webp"),
    api.media,
    onChange,
    nativeTransport,
  );
}
