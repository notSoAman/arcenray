// Use the web app's JavaScript fetch transport for media playback checks.
const url = process.env.ARCENRAY_SMOKE_MEDIA_URL;
if (!url) throw new Error("Missing disposable media URL");
const origin = "http://localhost:3000";
const response = await fetch(url, {
  headers: { Range: "bytes=0-15", Origin: origin },
  signal: AbortSignal.timeout(30000),
});
const bytes = await response.arrayBuffer();
if (response.status !== 206 || bytes.byteLength !== 16)
  throw new Error(
    `Media Range delivery failed: HTTP ${response.status}, ${bytes.byteLength} bytes`,
  );
if (response.headers.get("access-control-allow-origin") !== origin)
  throw new Error(
    "Media CORS did not permit the configured development origin",
  );
console.log("PASS JavaScript CDN Range delivery and configured-origin CORS");
