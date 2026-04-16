/**
 * Port for uploading and resolving media (images, audio, video).
 * Implementations: mock (in-memory), later S3/disk with stable URLs.
 */
import type { MediaFolderRecord, MediaListParams, MediaRecord, MediaUsageRef } from "./types";

export type UploadMediaParams = {
  /** File content. */
  body: ArrayBuffer | Buffer;
  /** Original filename (e.g. "photo.jpg"). */
  filename: string;
  /** MIME type (e.g. "image/jpeg", "audio/mpeg", "video/mp4"). */
  mimeType: string;
  /** Optional owner for access control. */
  userId?: string | null;
  /** Library folder (`null` = root). Omit for legacy behavior (root). */
  folderId?: string | null;
};

export type UploadMediaResult = {
  record: MediaRecord;
  /** URL to use in pages (e.g. /api/media/:id or CDN URL). */
  url: string;
};

export type MediaStoragePort = {
  upload(params: UploadMediaParams): Promise<UploadMediaResult>;
  getById(id: string): Promise<MediaRecord | null>;
  /** Returns URL for the media id, or null if not found. */
  getUrl(id: string): Promise<string | null>;
  list(params: MediaListParams): Promise<MediaRecord[]>;
  updateDisplayName(mediaId: string, displayName: string | null): Promise<boolean>;
  /** Move file between library folders (metadata only; does not change S3 key or /api/media/:id). */
  updateMediaFolder(mediaId: string, folderId: string | null): Promise<boolean>;
  listFolders(parentId: string | null): Promise<MediaFolderRecord[]>;
  listAllFolders(): Promise<MediaFolderRecord[]>;
  createFolder(params: { name: string; parentId: string | null; createdBy: string }): Promise<MediaFolderRecord>;
  renameFolder(folderId: string, name: string): Promise<boolean>;
  moveFolder(folderId: string, newParentId: string | null): Promise<boolean>;
  deleteFolder(folderId: string): Promise<{ ok: true } | { ok: false; error: "not_empty" }>;
  findUsage(mediaId: string): Promise<MediaUsageRef[]>;
  deleteHard(mediaId: string): Promise<boolean>;
};
