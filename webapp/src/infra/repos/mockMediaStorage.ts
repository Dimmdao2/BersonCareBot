/**
 * In-memory implementation of MediaStoragePort.
 * MVP mock: stores buffers in process memory; URLs are /api/media/:id.
 * Replace with disk/S3 implementation for production.
 */
import type { MediaStoragePort } from "@/modules/media/ports";
import type { MediaRecord } from "@/modules/media/types";

type StoredMedia = {
  record: MediaRecord;
  body: ArrayBuffer;
};

const store = new Map<string, StoredMedia>();
let idCounter = 1;

const MEDIA_PATH_PREFIX = "/api/media";

function kindFromMime(mimeType: string): "image" | "audio" | "video" {
  const lower = mimeType.toLowerCase();
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("audio/")) return "audio";
  if (lower.startsWith("video/")) return "video";
  return "image";
}

export const mockMediaStoragePort: MediaStoragePort = {
  async upload(params) {
    const body = params.body instanceof ArrayBuffer ? params.body : new Uint8Array(params.body).buffer as ArrayBuffer;
    const id = `media-${idCounter++}`;
    const now = new Date().toISOString();
    const record: MediaRecord = {
      id,
      kind: kindFromMime(params.mimeType),
      mimeType: params.mimeType,
      filename: params.filename,
      size: body.byteLength,
      userId: params.userId ?? null,
      createdAt: now,
    };
    store.set(id, { record, body });
    const url = `${MEDIA_PATH_PREFIX}/${id}`;
    return { record, url };
  },

  async getById(id) {
    const stored = store.get(id);
    return stored ? stored.record : null;
  },

  async getUrl(id) {
    const stored = store.get(id);
    return stored ? `${MEDIA_PATH_PREFIX}/${id}` : null;
  },
};

/** Used by GET /api/media/[id] to serve the buffer. */
export function getStoredMediaBody(id: string): { body: ArrayBuffer; mimeType: string } | null {
  const stored = store.get(id);
  if (!stored) return null;
  return { body: stored.body, mimeType: stored.record.mimeType };
}
