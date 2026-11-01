/** Recovery prompts describe interrupted transfers, never a healthy active one. */
export function recoveryNeeded(
  stage: string | undefined,
  hasSavedUpload: boolean,
) {
  return (
    hasSavedUpload &&
    !["hashing", "reserving", "uploading", "verifying", "complete"].includes(
      stage ?? "",
    )
  );
}

export function processingAsset(
  savedAsset: string | null,
  upload?: { stage: string; assetId?: string },
) {
  if (upload && (upload.stage !== "complete" || upload.assetId !== savedAsset))
    return null;
  return savedAsset;
}

export function publicationDestination(
  id: string,
  state: string | null,
  leave: boolean,
) {
  if (state === "complete") return `/films/${encodeURIComponent(id)}`;
  if (leave && (state === "pending" || state === "processing"))
    return "/home?publication=queued";
  return null;
}
