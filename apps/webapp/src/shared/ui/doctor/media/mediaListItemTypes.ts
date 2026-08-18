import type { MediaPreviewStatus } from '@/modules/media/types';

/** Row shape from GET /api/admin/media/[id] (same as library list items). */
export type MediaListItem = {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  filename: string;
  displayName?: string | null;
  mimeType: string;
  size: number;
  createdAt: string;
  url: string;
  previewSmUrl?: string | null;
  previewMdUrl?: string | null;
  previewStatus?: MediaPreviewStatus;
  /** `media_files.standard_rendition_at IS NOT NULL` — the stored object is our own re-encode. */
  standardRendition?: boolean;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
};
