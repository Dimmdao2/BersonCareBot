export type MediaKind = "image" | "audio" | "video" | "file";

export type MediaRecord = {
  id: string;
  kind: MediaKind;
  mimeType: string;
  filename: string;
  /** Optional display name editable in media library. */
  displayName?: string | null;
  /** Size in bytes. */
  size: number;
  /** Optional owner for future access control. */
  userId?: string | null;
  /** Optional uploader display name for admin metadata in media library. */
  uploadedByName?: string | null;
  createdAt: string;
  /** Resolved public URL (S3 public URL or /api/media/:id). Populated by list(). */
  url?: string;
};

export type MediaListSortBy = "createdAt" | "size" | "kind";
export type MediaSortDirection = "asc" | "desc";

export type MediaListParams = {
  kind?: MediaKind | "all";
  query?: string;
  sortBy?: MediaListSortBy;
  sortDir?: MediaSortDirection;
  limit?: number;
  offset?: number;
};

export type MediaUsageRef = {
  pageId: string;
  pageSlug: string;
  field: "image_url" | "video_url" | "body_md" | "body_html";
};
