/** XHR exposes upload progress without buffering the Blob or forwarding it through Next.js. */
export function putBlob(
  url: string,
  headers: Record<string, string>,
  blob: Blob,
  signal: AbortSignal,
  onProgress: (bytes: number) => void,
): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const cleanup = () => signal.removeEventListener("abort", abort);
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    const abort = () => {
      xhr.abort();
      fail(new DOMException("Upload cancelled", "AbortError"));
    };
    xhr.open("PUT", url);
    // Never forward the Supabase session to object storage.
    xhr.withCredentials = false;
    xhr.timeout = 30 * 60 * 1000;
    xhr.upload.onprogress = (event) =>
      onProgress(Math.min(blob.size, event.loaded));
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else
        reject(
          new Error(`Storage upload failed (${xhr.status}). Retry the upload.`),
        );
    };
    xhr.onerror = () =>
      fail(
        new Error("Upload connection failed. Check your connection and retry."),
      );
    xhr.ontimeout = () =>
      fail(new Error("Upload timed out. Retry the upload."));
    xhr.onabort = () =>
      fail(new DOMException("Upload cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    try {
      for (const [name, value] of Object.entries(headers)) {
        if (name.toLowerCase() === "content-type")
          xhr.setRequestHeader(name, value);
        // Content-Length is computed by the browser; other auth headers are never copied.
      }
      xhr.send(blob);
    } catch {
      fail(new Error("Browser could not start the upload. Retry the upload."));
    }
  });
}
