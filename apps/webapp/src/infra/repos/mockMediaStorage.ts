/**
 * In-memory implementation of MediaStoragePort.
 * MVP mock: stores buffers in process memory; URLs are /api/media/:id.
 * Replace with disk/S3 implementation for production.
 */
import type { MediaStoragePort } from "@/modules/media/ports";
import type { MediaFolderRecord, MediaRecord, MediaUsageRef } from "@/modules/media/types";

type StoredMedia = {
  record: MediaRecord;
  body: ArrayBuffer;
};

const store = new Map<string, StoredMedia>();
const folders = new Map<string, MediaFolderRecord>();
let idCounter = 1;
let folderCounter = 1;

const MEDIA_PATH_PREFIX = "/api/media";

function kindFromMime(mimeType: string): MediaRecord["kind"] {
  const lower = mimeType.toLowerCase();
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("audio/")) return "audio";
  if (lower.startsWith("video/")) return "video";
  return "file";
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
      displayName: null,
      size: body.byteLength,
      userId: params.userId ?? null,
      folderId: null,
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

  async list(params) {
    const q = params.query?.trim().toLowerCase() ?? "";
    const filtered = [...store.values()]
      .map((item) => item.record)
      .filter((item) => {
        if (params.kind && params.kind !== "all" && item.kind !== params.kind) return false;
        if (params.folderId !== undefined) {
          if (params.folderId === null) {
            if (item.folderId != null) return false;
          } else if (params.includeDescendants) {
            const allowed = new Set<string>([params.folderId]);
            let added = true;
            while (added) {
              added = false;
              for (const f of folders.values()) {
                if (f.parentId && allowed.has(f.parentId) && !allowed.has(f.id)) {
                  allowed.add(f.id);
                  added = true;
                }
              }
            }
            if (!item.folderId || !allowed.has(item.folderId)) return false;
          } else if (item.folderId !== params.folderId) {
            return false;
          }
        }
        if (q) {
          const name = (item.displayName?.trim() || item.filename).toLowerCase();
          if (!name.includes(q) && !item.filename.toLowerCase().includes(q)) return false;
        }
        return true;
      });

    const sortBy = params.sortBy ?? "createdAt";
    const sortDir = params.sortDir === "asc" ? 1 : -1;
    const displayLabel = (item: (typeof filtered)[number]) => item.displayName?.trim() || item.filename;
    filtered.sort((a, b) => {
      if (sortBy === "size") return (a.size - b.size) * sortDir;
      if (sortBy === "kind") return a.kind.localeCompare(b.kind) * sortDir;
      if (sortBy === "name") return displayLabel(a).localeCompare(displayLabel(b), "ru") * sortDir;
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * sortDir;
    });

    const offset = Math.max(0, params.offset ?? 0);
    const limit = Math.max(1, Math.min(200, params.limit ?? 50));
    return filtered.slice(offset, offset + limit).map((r) => {
      const base = `${MEDIA_PATH_PREFIX}/${r.id}`;
      const visual = r.kind === "image" || r.kind === "video";
      return {
        ...r,
        url: base,
        previewStatus: visual ? ("ready" as const) : ("skipped" as const),
        previewSmUrl: visual ? base : null,
        previewMdUrl: r.kind === "image" ? base : null,
        sourceWidth: null,
        sourceHeight: null,
      };
    });
  },

  async updateDisplayName(mediaId, displayName) {
    const stored = store.get(mediaId);
    if (!stored) return false;
    stored.record = {
      ...stored.record,
      displayName: displayName?.trim() ? displayName.trim() : null,
    };
    return true;
  },

  async findUsage(_mediaId): Promise<MediaUsageRef[]> {
    return [];
  },

  async deleteHard(mediaId) {
    return store.delete(mediaId);
  },

  async updateMediaFolder(mediaId, folderId) {
    const stored = store.get(mediaId);
    if (!stored) return false;
    stored.record = { ...stored.record, folderId };
    return true;
  },

  async listFolders(parentId) {
    return [...folders.values()].filter((f) =>
      parentId === null ? f.parentId === null : f.parentId === parentId,
    );
  },

  async listAllFolders() {
    return [...folders.values()];
  },

  async createFolder(params) {
    const id = `folder-${folderCounter++}`;
    const now = new Date().toISOString();
    const rec: MediaFolderRecord = {
      id,
      parentId: params.parentId,
      name: params.name.trim(),
      createdAt: now,
    };
    folders.set(id, rec);
    return rec;
  },

  async renameFolder(folderId, name) {
    const f = folders.get(folderId);
    if (!f) return false;
    folders.set(folderId, { ...f, name: name.trim() });
    return true;
  },

  async moveFolder(folderId, newParentId) {
    const f = folders.get(folderId);
    if (!f) return false;
    folders.set(folderId, { ...f, parentId: newParentId });
    return true;
  },

  async deleteFolder(folderId) {
    for (const f of folders.values()) {
      if (f.parentId === folderId) return { ok: false as const, error: "not_empty" as const };
    }
    for (const s of store.values()) {
      if (s.record.folderId === folderId) return { ok: false as const, error: "not_empty" as const };
    }
    if (!folders.delete(folderId)) return { ok: false as const, error: "not_empty" as const };
    return { ok: true as const };
  },
};

/** Used by GET /api/media/[id] to serve the buffer. */
export function getStoredMediaBody(id: string): { body: ArrayBuffer; mimeType: string } | null {
  const stored = store.get(id);
  if (!stored) return null;
  return { body: stored.body, mimeType: stored.record.mimeType };
}
