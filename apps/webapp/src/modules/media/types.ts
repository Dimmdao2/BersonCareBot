export type MediaKind = "image" | "audio" | "video" | "file";

export type MediaPreviewStatus = "pending" | "ready" | "failed" | "skipped";

/** VIDEO_HLS_DELIVERY — transcode pipeline state for library video rows (`media_files`). */
export type VideoProcessingStatus = "none" | "pending" | "processing" | "ready" | "failed";

/** Per-file playback preference once HLS exists (optional override). */
export type VideoDeliveryOverride = "mp4" | "hls" | "auto";

  /** Serialized into `media_files.available_qualities_json` after transcoding. */
export type MediaAvailableQuality = {
  /** Human label e.g. 720p (from worker). */
  label?: string;
  /** Relative path under HLS tree, e.g. 720p/index.m3u8. */
  path?: string;
  renditionId?: string;
  height?: number;
  bandwidth?: number;
};

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
  /** Library folder (null = root). Populated by list when column exists. */
  folderId?: string | null;
  /** Resolved public URL (S3 public URL or /api/media/:id). Populated by list(). */
  url?: string;
  /** Grid thumbnail from canonical shared preview URL helpers (sm size). */
  previewSmUrl?: string | null;
  /** Larger preview for viewer from canonical shared preview URL helpers (md size). */
  previewMdUrl?: string | null;
  /** Background preview generation state. */
  previewStatus?: MediaPreviewStatus;
  /** Original pixel dimensions (from worker / ffprobe); null for legacy rows until backfill. */
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  /** VIDEO_HLS_DELIVERY — null/omitted until pipeline writes status. */
  videoProcessingStatus?: VideoProcessingStatus | null;
  videoProcessingError?: string | null;
  hlsMasterPlaylistS3Key?: string | null;
  hlsArtifactPrefix?: string | null;
  posterS3Key?: string | null;
  videoDurationSeconds?: number | null;
  availableQualities?: MediaAvailableQuality[] | null;
  videoDeliveryOverride?: VideoDeliveryOverride | null;
};

export type MediaFolderRecord = {
  id: string;
  parentId: string | null;
  name: string;
  createdAt: string;
};

export type MediaListSortBy = "createdAt" | "size" | "kind" | "name";
export type MediaSortDirection = "asc" | "desc";

export type MediaListParams = {
  kind?: MediaKind | "all";
  query?: string;
  sortBy?: MediaListSortBy;
  sortDir?: MediaSortDirection;
  limit?: number;
  offset?: number;
  /**
   * Folder filter: omit = all files; `null` = root only (`folder_id IS NULL`);
   * string uuid = that folder; use with `includeDescendants` for subtree.
   */
  folderId?: string | null;
  /** When `folderId` is a uuid, include files in descendant folders (recursive). */
  includeDescendants?: boolean;
};

export type MediaUsageRef = {
  pageId: string;
  pageSlug: string;
  field: "image_url" | "video_url" | "body_md" | "body_html";
};

/** LFK exercise referencing this library media (`/api/media/:id`). */
export type MediaExerciseUsageEntry = {
  exerciseId: string;
  title: string;
};
