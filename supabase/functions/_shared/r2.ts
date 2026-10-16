import { AwsClient } from "aws4fetch";
import { env, HttpError } from "./http.ts";
function signer() {
  return new AwsClient({
    accessKeyId: env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    service: "s3",
    region: "auto",
  });
}
function objectUrl(bucket: string, key: string) {
  return new URL(
    `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`,
  );
}
export async function r2(
  method: string,
  bucket: string,
  key: string,
  headers?: Record<string, string>,
) {
  const response = await signer().fetch(objectUrl(bucket, key), {
    method,
    headers,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new HttpError(502, "Media storage request failed");
  return response;
}
export async function signUpload(key: string, bytes: number, type: string) {
  const url = objectUrl(env("R2_UPLOAD_BUCKET_NAME"), key);
  url.searchParams.set("X-Amz-Expires", "600");
  const signed = await signer().sign(url, {
    method: "PUT",
    headers: { "Content-Type": type, "Content-Length": String(bytes) },
    aws: { signQuery: true, allHeaders: true },
  });
  // Browser sets Content-Length from the Blob automatically. It must equal the reservation.
  return {
    upload_url: signed.url,
    headers: { "Content-Type": type },
    expires_at: new Date(Date.now() + 600000).toISOString(),
  };
}
export async function copyPublic(
  key: string,
  id: string,
  etag: string,
  type: string,
) {
  const source = `/${env("R2_UPLOAD_BUCKET_NAME")}/${key}`;
  const response = await r2("PUT", env("R2_BUCKET_NAME"), `assets/${id}`, {
    "x-amz-copy-source": source,
    "x-amz-copy-source-if-match": etag,
    "x-amz-metadata-directive": "REPLACE",
    "Content-Type": type,
    "Cache-Control": "public,max-age=31536000,immutable",
  });
  // S3 may encode CopyObject errors in a successful HTTP response.
  if ((await response.text()).includes("<Error>"))
    throw new HttpError(502, "Media promotion failed");
}
export async function readRange(
  key: string,
  start: number,
  end: number,
  etag: string,
) {
  const r = await r2("GET", env("R2_UPLOAD_BUCKET_NAME"), key, {
    Range: `bytes=${start}-${end}`,
    "If-Match": etag,
  });
  if (r.status !== 206)
    throw new HttpError(422, "Media range response invalid");
  return new Uint8Array(await r.arrayBuffer());
}
// Walk box headers without downloading mdat. moov is capped at 4 MiB, 128 top-level boxes.
export async function readMoov(key: string, size: number, etag: string) {
  let offset = 0;
  let ftyp = false;
  let moov: Uint8Array | undefined;
  const mdatRanges: { start: number; end: number }[] = [];
  for (let count = 0; count < 128 && offset + 8 <= size; count++) {
    const h = await readRange(
      key,
      offset,
      Math.min(offset + 15, size - 1),
      etag,
    );
    const v = new DataView(h.buffer, h.byteOffset, h.byteLength);
    let length = v.getUint32(0);
    const type = new TextDecoder().decode(h.subarray(4, 8));
    let header = 8;
    if (length === 1) {
      if (h.length < 16) throw new HttpError(422, "Truncated MP4");
      length = Number(v.getBigUint64(8));
      header = 16;
    }
    if (length === 0) length = size - offset;
    if (
      !Number.isSafeInteger(length) ||
      length < header ||
      offset + length > size
    )
      throw new HttpError(422, "Invalid MP4 box");
    if (type === "ftyp") ftyp = true;
    if (type === "moof")
      throw new HttpError(422, "Export a non-fragmented H.264 MP4");
    if (type === "mdat")
      mdatRanges.push({ start: offset + header, end: offset + length });
    if (type === "moov") {
      if (moov || !ftyp || length > 4 * 1024 * 1024)
        throw new HttpError(422, "Unsupported MP4 metadata");
      moov = await readRange(key, offset, offset + length - 1, etag);
    }
    offset += length;
  }
  if (offset !== size || !moov || !mdatRanges.length)
    throw new HttpError(422, "MP4 media or metadata missing");
  return { moov, fileSize: size, mdatRanges };
}
