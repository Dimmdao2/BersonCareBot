import type { MediaPreviewStatus } from "@/modules/media/types";

/** Row shape from GET /api/admin/media/[id] (same as library list items). */
export type MediaListItem = {
  id: string;
  kind: "image" | "video" | "audio" | "file";
  filename: string;
  displayName?: string | null;
  mimeType: string;
  size: number;
  createdAt: string;
  url: string;
  previewSmUrl?: string | null;
  previewMdUrl?: string | null;
  previewStatus?: MediaPreviewStatus;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
};
