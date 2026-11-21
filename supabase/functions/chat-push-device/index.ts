import { z } from "zod";
import {
  admin,
  auth,
  HttpError,
  jsonBody,
  rateLimit,
  serve,
} from "../_shared/http.ts";

const input = z
  .object({
    installation: z.uuid(),
    token: z
      .string()
      .max(200)
      .regex(/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/)
      .nullable(),
  })
  .strict();

serve(async (request) => {
  const { user } = await auth(request);
  const body = input.parse(await jsonBody(request));
  await rateLimit(user.id, "chat_push_device", 60);
  const result = await admin()
    .rpc("backend_manage_chat_push_device", {
      p_actor: user.id,
      p_installation: body.installation,
      p_token: body.token,
    })
    .abortSignal(AbortSignal.timeout(5000));
  if (result.error) throw new HttpError(503, "Push registration unavailable");
  if (result.data !== true)
    throw new HttpError(409, "Device could not be registered");
  return { ok: true };
});
