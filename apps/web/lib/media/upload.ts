import { putBlob } from "./transport.ts";
import { createUploadTask as createTask } from "@repo/shared/media-upload";
export * from "@repo/shared/media-upload";
export function createUploadTask(
  kind: Parameters<typeof createTask>[0],
  blob: Blob,
  api: Parameters<typeof createTask>[2],
  onChange?: Parameters<typeof createTask>[3],
) {
  return createTask(
    kind,
    blob,
    api,
    onChange,
    (url, headers, chunk, signal, progress) =>
      putBlob(url, headers, chunk as Blob, signal, progress),
  );
}
