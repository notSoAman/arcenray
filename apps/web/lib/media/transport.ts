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
    let settled = false;
    let idle: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(idle);
      signal.removeEventListener("abort", abort);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const activity = () => {
      clearTimeout(idle);
      idle = setTimeout(() => {
        fail(new Error("The connection stopped responding. Reconnecting…"));
        xhr.abort();
      }, 90_000);
    };
    const abort = () => {
      xhr.abort();
      fail(new DOMException("Upload cancelled", "AbortError"));
    };
    xhr.open("PUT", url);
    // Never forward the Supabase session to object storage.
    xhr.withCredentials = false;
    xhr.timeout = 30 * 60 * 1000;
    xhr.upload.onprogress = (event) => {
      activity();
      onProgress(Math.min(blob.size, event.loaded));
    };
    xhr.upload.onload = activity;
    xhr.onload = () => {
      if (settled) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        settled = true;
        cleanup();
        resolve();
      } else {
        const error = Object.assign(
          new Error("The file could not be uploaded. Try again."),
          {
            retryable:
              [0, 403, 408, 429].includes(xhr.status) || xhr.status >= 500,
          },
        );
        fail(error);
      }
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
      signal.throwIfAborted();
      for (const [name, value] of Object.entries(headers)) {
        if (name.toLowerCase() === "content-type")
          xhr.setRequestHeader(name, value);
        // Content-Length is computed by the browser; other auth headers are never copied.
      }
      activity();
      xhr.send(blob);
    } catch {
      fail(new Error("Browser could not start the upload. Retry the upload."));
    }
  });
}
