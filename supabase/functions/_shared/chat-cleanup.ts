import { admin, checked, env } from "./http.ts";
import { r2Lifecycle } from "./r2.ts";
/** The database marks stale/unbound/deleted-owner attachments before deletion. */
export async function cleanupChatAttachments(deadline: number) {
  const rows = checked(
    await admin().rpc("backend_chat_attachment", {
      p_actor: null,
      p_action: "cleanup",
      p_data: {},
    }),
  ) as { id: string; object_keys: string[] }[];
  let removed = 0;
  for (const row of rows) {
    if (Date.now() + 6000 > deadline) break;
    if (!/^[0-9a-f-]{36}$/.test(row.id)) continue;
    const prefix = `chat/${row.id}/`;
    const keys = [prefix + "source", ...row.object_keys];
    if (
      keys.some(
        (key) =>
          !key.startsWith(prefix) ||
          !/^(source|[0-9a-f-]{36})$/.test(key.slice(prefix.length)),
      )
    )
      continue;
    try {
      for (const key of keys)
        await r2Lifecycle("DELETE", env("R2_UPLOAD_BUCKET_NAME"), key, 3000);
      checked(
        await admin().rpc("backend_chat_attachment", {
          p_actor: null,
          p_action: "removed",
          p_data: { asset_id: row.id },
        }),
      );
      removed++;
    } catch {
      /* Keep the deletion marker and retry next scheduled run. */
    }
  }
  return removed;
}
