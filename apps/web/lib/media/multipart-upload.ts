import { putBlob } from "./transport.ts";
import { createMultipartUploadTask as createTask } from "@repo/shared/media";
export * from "@repo/shared/media";
export function createMultipartUploadTask(
  blob: Blob,
  api: Parameters<typeof createTask>[1],
  options: Omit<Parameters<typeof createTask>[2], "transport"> & {
    transport?: typeof putBlob;
  },
) {
  const transport = options.transport ?? putBlob;
  // This web adapter receives real Blobs; native file ranges use another transport.
  return createTask(blob, api, {
    ...options,
    transport: (url, headers, chunk, signal, progress) =>
      transport(url, headers, chunk as Blob, signal, progress),
  });
}
