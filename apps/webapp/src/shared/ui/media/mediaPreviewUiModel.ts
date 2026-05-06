import type { MediaPreviewStatus } from "@/modules/media/types";
import type { ExerciseMedia } from "@/modules/lfk-exercises/types";
import type { ClinicalTestMediaItem } from "@/modules/tests/types";
import type { RecommendationMediaItem } from "@/modules/recommendations/types";
import { parseMediaFileIdFromAppUrl } from "@/shared/lib/mediaPreviewUrls";

/**
 * Canonical client-side media shape for grid/list/picker thumbnails (mapping layer only; API types stay unchanged).
 */
export type MediaPreviewUiModel = {
  id: string;
  kind: "image" | "video" | "audio" | "file";
  url: string;
  previewStatus?: MediaPreviewStatus | null;
  previewSmUrl: string | null;
  previewMdUrl?: string | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
};

export function libraryMediaRowToPreviewUi(item: {
  id: string;
  kind: MediaPreviewUiModel["kind"];
  url: string;
  previewSmUrl?: string | null;
  previewMdUrl?: string | null;
  previewStatus?: MediaPreviewStatus | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
}): MediaPreviewUiModel {
  return {
    id: item.id,
    kind: item.kind,
    url: item.url,
    previewStatus: item.previewStatus ?? null,
    previewSmUrl: item.previewSmUrl ?? null,
    previewMdUrl: item.previewMdUrl ?? null,
    sourceWidth: item.sourceWidth ?? null,
    sourceHeight: item.sourceHeight ?? null,
  };
}

export function exerciseMediaToPreviewUi(m: ExerciseMedia): MediaPreviewUiModel {
  const kind: MediaPreviewUiModel["kind"] = m.mediaType === "video" ? "video" : "image";
  return {
    id: m.id,
    kind,
    url: m.mediaUrl,
    previewStatus: m.previewStatus ?? null,
    previewSmUrl: m.previewSmUrl ?? null,
    previewMdUrl: m.previewMdUrl ?? null,
    sourceWidth: null,
    sourceHeight: null,
  };
}

/** Превью медиа клинического теста (в JSON нет id слота — ключом служит URL). */
export function clinicalTestMediaItemToPreviewUi(m: ClinicalTestMediaItem): MediaPreviewUiModel {
  const kind: MediaPreviewUiModel["kind"] = m.mediaType === "video" ? "video" : "image";
  return {
    id: m.mediaUrl,
    kind,
    url: m.mediaUrl,
    previewStatus: null,
    previewSmUrl: null,
    previewMdUrl: null,
    sourceWidth: null,
    sourceHeight: null,
  };
}

/** Превью медиа рекомендации (GIF — как изображение). Для image/gif — исходный URL; для video — превью воркера из снимка, если есть. */
export function recommendationMediaItemToPreviewUi(m: RecommendationMediaItem): MediaPreviewUiModel {
  const kind: MediaPreviewUiModel["kind"] = m.mediaType === "video" ? "video" : "image";
  const useSourceUrlForThumb = m.mediaType === "image" || m.mediaType === "gif";
  const rowSm = m.previewSmUrl?.trim() || null;
  const rowMd = m.previewMdUrl?.trim() || null;
  const rowStatus = m.previewStatus ?? null;
  const useWorkerThumb = !useSourceUrlForThumb && Boolean(rowSm);
  return {
    id: m.mediaUrl,
    kind,
    url: m.mediaUrl,
    previewStatus: useSourceUrlForThumb ? "ready" : useWorkerThumb ? (rowStatus ?? "ready") : rowStatus,
    previewSmUrl: useSourceUrlForThumb ? m.mediaUrl : rowSm,
    previewMdUrl: useSourceUrlForThumb ? null : rowMd,
    sourceWidth: null,
    sourceHeight: null,
  };
}

export function lfkCoverToPreviewUi(complex: {
  id: string;
  coverImageUrl?: string | null;
  coverKind?: "image" | "video";
  coverPreviewSmUrl?: string | null;
  coverPreviewMdUrl?: string | null;
  coverPreviewStatus?: MediaPreviewStatus;
}): MediaPreviewUiModel {
  const kind: MediaPreviewUiModel["kind"] = complex.coverKind === "video" ? "video" : "image";
  const id = parseMediaFileIdFromAppUrl(complex.coverImageUrl ?? "") ?? complex.id;
  return {
    id,
    kind,
    url: complex.coverImageUrl?.trim() ?? "",
    previewStatus: complex.coverPreviewStatus ?? null,
    previewSmUrl: complex.coverPreviewSmUrl?.trim() ?? null,
    previewMdUrl: complex.coverPreviewMdUrl ?? null,
    sourceWidth: null,
    sourceHeight: null,
  };
}

/**
 * Selected value in the library picker: preview status comes only from `lastPick` (API row); never inferred from URL shape.
 */
export function mediaLibraryPickerSelectionToPreviewUi(args: {
  value: string;
  thumbKind: "image" | "video";
  lastPick: {
    previewSmUrl?: string | null;
    previewMdUrl?: string | null;
    previewStatus?: MediaPreviewStatus | null;
  } | null;
}): MediaPreviewUiModel {
  const trimmed = args.value.trim();
  const id = parseMediaFileIdFromAppUrl(trimmed) ?? "";
  return {
    id: id || "pending",
    kind: args.thumbKind,
    url: trimmed,
    previewStatus: args.lastPick?.previewStatus ?? null,
    previewSmUrl: args.lastPick?.previewSmUrl ?? null,
    previewMdUrl: args.lastPick?.previewMdUrl ?? null,
    sourceWidth: null,
    sourceHeight: null,
  };
}
