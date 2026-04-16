export type MediaThumbPhase =
  | "ready"
  | "pending"
  | "failed"
  | "skipped"
  | "non_visual";

export type MediaThumbPhaseInput = {
  kind: "image" | "video" | "audio" | "file";
  previewStatus?: string | null;
  previewSmUrl?: string | null;
};

/**
 * Pure phase for grid/list/picker thumbnails (no original URL fallback).
 * Single source of truth for thumbnail phase derivation. Do not duplicate.
 */
export function getMediaThumbPhase(item: MediaThumbPhaseInput): MediaThumbPhase {
  if (item.kind === "audio" || item.kind === "file") return "non_visual";

  const status = (item.previewStatus ?? "pending").trim().toLowerCase();
  const sm = item.previewSmUrl?.trim();

  if (status === "failed") return "failed";
  if (status === "skipped") return "skipped";
  if (status === "ready" && sm) return "ready";
  if (status === "pending" || (status === "ready" && !sm)) return "pending";

  /* Unknown status — treat as pending (worker/API drift). */
  return "pending";
}
