import { z } from "zod";
import {
  serve,
  auth,
  admin,
  checked,
  env,
  HttpError,
  jsonBody,
  rateLimit,
} from "../_shared/http.ts";
import {
  objectUrl,
  signer,
  r2,
  signUpload,
  copyResultEtag,
  copiedHeadSnapshot,
} from "../_shared/r2.ts";
const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      conversation_id: z.string().uuid(),
      name: z.string().trim().min(1).max(180),
      content_type: z.string().max(100),
      bytes: z
        .number()
        .int()
        .min(1)
        .max(20 * 1024 * 1024),
    })
    .strict(),
  z
    .object({ action: z.literal("complete"), asset_id: z.string().uuid() })
    .strict(),
  z
    .object({ action: z.literal("download"), asset_id: z.string().uuid() })
    .strict(),
]);
type Attachment = {
  id: string;
  name: string;
  content_type: string;
  bytes: number;
  state: string;
  ready_key: string | null;
  attempt_key?: string;
};
serve(async (req) => {
  const { user } = await auth(req);
  const body = input.parse(await jsonBody(req));
  await rateLimit(
    user.id,
    body.action === "create" ? "chat_upload" : "chat_access",
    body.action === "create" ? 60 : 1200,
  );
  const call = async (action: string, data: unknown): Promise<Attachment> =>
    checked(
      await admin().rpc("backend_chat_attachment", {
        p_actor: user.id,
        p_action: action,
        p_data: data,
      }),
    ) as Attachment;
  const a = await call(
    body.action === "complete" ? "upload" : body.action,
    body,
  );
  const source = `chat/${a.id}/source`,
    bucket = env("R2_UPLOAD_BUCKET_NAME");
  if (body.action === "create")
    return {
      asset_id: a.id,
      ...(await signUpload(source, a.bytes, a.content_type)),
    };
  if (body.action === "complete") {
    if (a.state !== "uploaded") {
      const head = await r2("HEAD", bucket, source);
      if (
        Number(head.headers.get("content-length")) !== a.bytes ||
        head.headers.get("content-type")?.split(";")[0] !== a.content_type
      )
        throw new HttpError(
          400,
          "The file did not finish uploading. Please try again.",
        );
      const etag = head.headers.get("etag");
      if (!etag) throw new HttpError(409, "Upload is not ready");
      // Freeze the verified bytes: an unexpired PUT URL must never alter a sent file.
      const attempt = await call("prepare", { asset_id: a.id });
      if (!attempt.attempt_key) return { asset_id: a.id };
      const ready = attempt.attempt_key;
      const copy = await r2("PUT", bucket, ready, {
        "x-amz-copy-source": `/${bucket}/${source}`,
        "x-amz-copy-source-if-match": etag,
        "x-amz-metadata-directive": "REPLACE",
        "Content-Type": a.content_type,
        "Cache-Control": "private,no-store",
      });
      const copied = copyResultEtag(await copy.text());
      copiedHeadSnapshot(
        await r2("HEAD", bucket, ready),
        copied,
        a.bytes,
        a.content_type,
      );
      await call("complete", { asset_id: a.id, ready_key: ready });
    }
    return { asset_id: a.id };
  }
  if (!a.ready_key) throw new HttpError(409, "Attachment not ready");
  const url = objectUrl(bucket, a.ready_key);
  url.searchParams.set("X-Amz-Expires", "300");
  const inline =
    a.content_type.startsWith("image/") || a.content_type.startsWith("audio/");
  url.searchParams.set(
    "response-content-disposition",
    `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
  );
  url.searchParams.set("response-cache-control", "private,no-store");
  const signed = await signer().sign(url, {
    method: "GET",
    aws: { signQuery: true },
  });
  return {
    url: signed.url,
    name: a.name,
    content_type: a.content_type,
    bytes: a.bytes,
  };
});
