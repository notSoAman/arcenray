export type ProcessingStatus = {
  state: string;
  stage?: string | null;
  error?: string | null;
};

const exportErrors: Record<string, string> = {
  multiple_tracks:
    "This file has extra video or audio tracks. Export one video track and one audio track, then upload it again.",
  hdr_unsupported:
    "This film uses HDR. Export an SDR version, then upload it again.",
  unsupported_media:
    "This export needs a different format. Try an MP4 with square pixels at 1080p or below.",
  invalid_media:
    "We couldn’t read this film all the way through. Export a fresh MP4 and upload it again.",
  source_changed:
    "This upload no longer matches the original file. Upload a fresh copy.",
  processing_timeout:
    "This export took too long to prepare. Try a 1080p MP4 export.",
};

export function canRetryProcessing(status: ProcessingStatus) {
  return status.state === "failed" && !exportErrors[status.error ?? ""];
}

export function processingLabel(status: ProcessingStatus) {
  if (status.state === "complete") return "Your film is ready to publish.";
  if (status.state === "failed")
    return (
      exportErrors[status.error ?? ""] ??
      "We couldn’t finish preparing your film. Your upload is saved; try again."
    );
  if (status.state === "processing") {
    if (status.stage === "downloading")
      return "Your upload is saved. Getting your film ready…";
    if (status.stage === "checking")
      return "Checking that your film plays correctly…";
    if (status.stage === "uploading")
      return "Saving the finished film. Nearly ready…";
    return "Preparing your film for playback. Longer films can take more time.";
  }
  if (status.state === "cancelled")
    return "Preparation stopped. Check your saved draft before uploading again.";
  return "Your upload is saved and waiting to be prepared.";
}
