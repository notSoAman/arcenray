import { env, HttpError } from "./http.ts";
import { objectUrl, signer } from "./r2.ts";

export const FILM_PART_BYTES = 16 * 1024 * 1024;
export type StoredPart = { part_number: number; bytes: number; etag: string };
type Query = Record<string, string>;
export type MultipartRequest = (
  method: string,
  key: string,
  query: Query,
  body?: string,
  headers?: Record<string, string>,
  deadline?: number,
) => Promise<Response>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validatePrivateKey(key: string) {
  const segments = key.split("/");
  if (segments.length !== 2 || !segments.every((x) => uuid.test(x)))
    throw new HttpError(500, "Invalid multipart object key");
}
export function validateUploadId(id: string) {
  if (!/^[A-Za-z0-9_~+/.=\-]{1,2048}$/.test(id))
    throw new HttpError(502, "Invalid multipart storage response");
  return id;
}
function decodeXml(text: string) {
  return text.replace(
    /&(quot|apos|lt|gt|amp);/g,
    (_, entity) =>
      ({ quot: '"', apos: "'", lt: "<", gt: ">", amp: "&" })[
        entity as "quot" | "apos" | "lt" | "gt" | "amp"
      ],
  );
}
function xmlValue(xml: string, tag: string) {
  // Tag names are internal literals; provider bodies are bounded and never executed.
  const value = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1];
  if (value === undefined)
    throw new HttpError(502, "Invalid multipart storage response");
  return decodeXml(value.trim());
}
async function readXml(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let count = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      count += part.value.length;
      if (count > 512 * 1024) {
        await reader.cancel();
        throw new HttpError(502, "Multipart response too large");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  const xml = new TextDecoder().decode(buffer);
  if (/<!DOCTYPE|<!ENTITY|<Error>/.test(xml))
    throw new HttpError(502, "Multipart storage operation failed");
  return xml;
}
function etag(value: string) {
  if (!/^"[a-fA-F0-9]+(?:-[0-9]+)?"$/.test(value))
    throw new HttpError(502, "Invalid multipart storage ETag");
  return value;
}
export function validateStoredParts(bytes: number, parts: StoredPart[]) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 2147483648)
    throw new HttpError(400, "Invalid film size");
  const count = Math.ceil(bytes / FILM_PART_BYTES);
  if (parts.length !== count)
    throw new HttpError(409, "Upload all film parts before completing");
  const sorted = [...parts].sort((a, b) => a.part_number - b.part_number);
  for (let i = 0; i < count; i++) {
    const expected = Math.min(FILM_PART_BYTES, bytes - i * FILM_PART_BYTES);
    if (sorted[i]!.part_number !== i + 1 || sorted[i]!.bytes !== expected)
      throw new HttpError(409, "Film parts differ from the reserved size");
    etag(sorted[i]!.etag);
  }
  return sorted;
}
const storageRequest: MultipartRequest = async (
  method,
  key,
  query,
  body,
  headers,
  deadline = Date.now() + 10000,
) => {
  if (key) validatePrivateKey(key);
  const remaining = Math.min(10000, deadline - Date.now());
  if (remaining <= 0)
    throw new HttpError(503, "Multipart request budget exhausted");
  const url = objectUrl(env("R2_UPLOAD_BUCKET_NAME"), key);
  for (const [name, value] of Object.entries(query))
    url.searchParams.set(name, value);
  const request = await signer().sign(url, { method, headers, body });
  const response = await fetch(request, {
    signal: AbortSignal.timeout(remaining),
    redirect: "error",
  });
  if (!response.ok && response.status !== 404)
    throw new HttpError(502, "Multipart storage request failed");
  return response;
};

/** Bounded provider operations; injected transport permits real failure/ordering tests. */
export function createMultipartStorage(
  request: MultipartRequest = storageRequest,
) {
  const listUploads = async (key: string, deadline?: number) => {
    validatePrivateKey(key);
    const response = await request(
      "GET",
      "",
      { uploads: "", prefix: key, "max-uploads": "100" },
      undefined,
      undefined,
      deadline,
    );
    if (!response.ok) throw new HttpError(502, "Multipart discovery failed");
    const xml = await readXml(response);
    if (!xml.includes("<ListMultipartUploadsResult"))
      throw new HttpError(502, "Invalid multipart discovery response");
    const ids: string[] = [];
    for (const match of xml.matchAll(/<Upload>([\s\S]*?)<\/Upload>/g)) {
      if (xmlValue(match[1]!, "Key") !== key) continue;
      ids.push(validateUploadId(xmlValue(match[1]!, "UploadId")));
    }
    if (ids.length > 100)
      throw new HttpError(502, "Invalid multipart discovery count");
    const truncated = xmlValue(xml, "IsTruncated");
    if (!["true", "false"].includes(truncated))
      throw new HttpError(502, "Invalid multipart pagination");
    return { ids, truncated: truncated === "true" };
  };
  const abort = async (key: string, id: string, deadline?: number) => {
    validatePrivateKey(key);
    validateUploadId(id);
    const response = await request(
      "DELETE",
      key,
      { uploadId: id },
      undefined,
      undefined,
      deadline,
    );
    if (!response.ok && response.status !== 404)
      throw new HttpError(502, "Multipart abort failed");
    if (response.ok) await readXml(response);
  };
  return {
    async initialize(key: string) {
      validatePrivateKey(key);
      const deadline = Date.now() + 25000;
      const existing = await listUploads(key, deadline);
      if (existing.ids.length === 1 && !existing.truncated)
        return existing.ids[0]!;
      // No client received signatures before the ID was durably recorded. Multiple
      // unrecorded initiations are safely reaped before another one is created.
      for (const id of existing.ids) await abort(key, id, deadline);
      if (existing.truncated)
        throw new HttpError(
          503,
          "Multipart initialization needs another cleanup retry",
        );
      const response = await request(
        "POST",
        key,
        { uploads: "" },
        undefined,
        { "Content-Type": "video/mp4", "Cache-Control": "private,no-store" },
        deadline,
      );
      if (!response.ok)
        throw new HttpError(502, "Multipart initialization failed");
      return validateUploadId(xmlValue(await readXml(response), "UploadId"));
    },
    listUploads,
    abort,
    async head(key: string) {
      validatePrivateKey(key);
      const response = await request("HEAD", key, {});
      if (response.status === 404) return null;
      const bytes = Number(response.headers.get("content-length"));
      const value = response.headers.get("etag");
      const type = response.headers.get("content-type")?.split(";")[0];
      if (
        !Number.isSafeInteger(bytes) ||
        bytes <= 0 ||
        !value ||
        type !== "video/mp4"
      )
        throw new HttpError(502, "Invalid assembled film metadata");
      return { bytes, etag: etag(value) };
    },
    async parts(key: string, id: string) {
      validatePrivateKey(key);
      validateUploadId(id);
      const response = await request("GET", key, {
        uploadId: id,
        "max-parts": "1000",
      });
      if (response.status === 404) return null;
      const xml = await readXml(response);
      if (
        !xml.includes("<ListPartsResult") ||
        xmlValue(xml, "IsTruncated") !== "false"
      )
        throw new HttpError(502, "Invalid multipart part listing");
      const parts: StoredPart[] = [];
      for (const match of xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)) {
        const part_number = Number(xmlValue(match[1]!, "PartNumber"));
        const bytes = Number(xmlValue(match[1]!, "Size"));
        if (
          !Number.isSafeInteger(part_number) ||
          part_number < 1 ||
          part_number > 128 ||
          !Number.isSafeInteger(bytes) ||
          bytes <= 0 ||
          bytes > FILM_PART_BYTES
        )
          throw new HttpError(502, "Invalid stored film part");
        parts.push({
          part_number,
          bytes,
          etag: etag(xmlValue(match[1]!, "ETag")),
        });
      }
      if (
        parts.length > 128 ||
        new Set(parts.map((p) => p.part_number)).size !== parts.length
      )
        throw new HttpError(502, "Duplicate stored film parts");
      return parts.sort((a, b) => a.part_number - b.part_number);
    },
    async complete(
      key: string,
      id: string,
      bytes: number,
      parts: StoredPart[],
    ) {
      validatePrivateKey(key);
      validateUploadId(id);
      const verified = validateStoredParts(bytes, parts);
      const body =
        "<CompleteMultipartUpload>" +
        verified
          .map(
            (p) =>
              `<Part><PartNumber>${p.part_number}</PartNumber><ETag>${p.etag.replaceAll('"', "&quot;")}</ETag></Part>`,
          )
          .join("") +
        "</CompleteMultipartUpload>";
      const response = await request("POST", key, { uploadId: id }, body, {
        "Content-Type": "application/xml",
      });
      if (!response.ok)
        throw new HttpError(502, "Multipart completion not confirmed");
      const xml = await readXml(response);
      if (!xml.includes("<CompleteMultipartUploadResult"))
        throw new HttpError(502, "Multipart completion not confirmed");
      return etag(xmlValue(xml, "ETag"));
    },
    async abortAll(key: string, deadline = Date.now() + 30000) {
      const found = await listUploads(key, deadline);
      for (const id of found.ids) await abort(key, id, deadline);
      if (found.truncated)
        throw new HttpError(503, "More multipart cleanup remains");
      if (found.ids.length && (await listUploads(key, deadline)).ids.length)
        throw new HttpError(503, "Multipart abort not confirmed");
    },
  };
}
export async function signFilmParts(
  key: string,
  id: string,
  bytes: number,
  numbers: number[],
) {
  validatePrivateKey(key);
  validateUploadId(id);
  const count = Math.ceil(bytes / FILM_PART_BYTES);
  if (
    !Number.isSafeInteger(bytes) ||
    bytes <= 0 ||
    bytes > 2147483648 ||
    numbers.length < 1 ||
    numbers.length > 2 ||
    new Set(numbers).size !== numbers.length ||
    numbers.some((n) => !Number.isSafeInteger(n) || n < 1 || n > count)
  )
    throw new HttpError(400, "Invalid film part selection");
  return Promise.all(
    numbers.map(async (part_number) => {
      const size = Math.min(
        FILM_PART_BYTES,
        bytes - (part_number - 1) * FILM_PART_BYTES,
      );
      const url = objectUrl(env("R2_UPLOAD_BUCKET_NAME"), key);
      url.searchParams.set("uploadId", id);
      url.searchParams.set("partNumber", String(part_number));
      url.searchParams.set("X-Amz-Expires", "600");
      const signed = await signer().sign(url, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(size),
        },
        aws: { signQuery: true, allHeaders: true },
      });
      return {
        part_number,
        bytes: size,
        upload_url: signed.url,
        headers: { "Content-Type": "video/mp4" },
        expires_at: new Date(Date.now() + 600000).toISOString(),
      };
    }),
  );
}
