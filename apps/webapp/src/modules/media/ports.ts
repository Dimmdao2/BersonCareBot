/**
 * Port for uploading and resolving media (images, audio, video).
 * Implementations: mock (in-memory), later S3/disk with stable URLs.
 */
import type { MediaListParams, MediaRecord, MediaUsageRef } from "./types";

export type UploadMediaParams = {
  /** File content. */
  body: ArrayBuffer | Buffer;
  /** Original filename (e.g. "photo.jpg"). */
  filename: string;
  /** MIME type (e.g. "image/jpeg", "audio/mpeg", "video/mp4"). */
  mimeType: string;
  /** Optional owner for access control. */
  userId?: string | null;
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
  findUsage(mediaId: string): Promise<MediaUsageRef[]>;
  deleteHard(mediaId: string): Promise<boolean>;
};
