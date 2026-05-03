import type { MediaStoragePort } from "./ports";
import type { MediaRecord } from "./types";

export type { MediaRecord, MediaPreviewStatus, MediaAvailableQuality, VideoDeliveryOverride, VideoProcessingStatus } from "./types";
export type { MediaListParams, MediaListSortBy, MediaSortDirection, MediaUsageRef } from "./types";
export type { UploadMediaParams, UploadMediaResult, MediaStoragePort } from "./ports";

export function createMediaService(port: MediaStoragePort) {
  return {
    async upload(params: Parameters<MediaStoragePort["upload"]>[0]) {
      return port.upload(params);
    },
    async getUrl(id: string): Promise<string | null> {
      return port.getUrl(id);
    },
    async getById(id: string): Promise<MediaRecord | null> {
      return port.getById(id);
    },
    async list(params: Parameters<MediaStoragePort["list"]>[0]) {
      return port.list(params);
    },
    async updateDisplayName(mediaId: string, displayName: string | null) {
      return port.updateDisplayName(mediaId, displayName);
    },
    async findUsage(mediaId: string) {
      return port.findUsage(mediaId);
    },
    async deleteHard(mediaId: string) {
      return port.deleteHard(mediaId);
    },
    async updateMediaFolder(mediaId: string, folderId: string | null) {
      return port.updateMediaFolder(mediaId, folderId);
    },
    async listFolders(parentId: string | null) {
      return port.listFolders(parentId);
    },
    async listAllFolders() {
      return port.listAllFolders();
    },
    async createFolder(params: Parameters<MediaStoragePort["createFolder"]>[0]) {
      return port.createFolder(params);
    },
    async renameFolder(folderId: string, name: string) {
      return port.renameFolder(folderId, name);
    },
    async moveFolder(folderId: string, newParentId: string | null) {
      return port.moveFolder(folderId, newParentId);
    },
    async deleteFolder(folderId: string) {
      return port.deleteFolder(folderId);
    },
  };
}
