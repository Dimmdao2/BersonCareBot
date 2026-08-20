import type { MediaStoragePort } from './ports';
import type { MediaRecord } from './types';
import {
  validateVideoAttachmentDuration,
  type VideoAttachmentPurpose,
} from './videoDurationLimit';

export type {
  MediaRecord,
  MediaPreviewStatus,
  MediaAvailableQuality,
  VideoDeliveryOverride,
  VideoProcessingStatus,
} from './types';
export type { MediaListParams, MediaListSortBy, MediaSortDirection, MediaUsageRef } from './types';
export type { UploadMediaParams, UploadMediaResult, MediaStoragePort } from './ports';

export type MediaWriteOptions = {
  runMediaWrite?: <T>(fn: () => Promise<T>) => Promise<T>;
};

function runMediaWrite<T>(
  options: MediaWriteOptions | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return options?.runMediaWrite ? options.runMediaWrite(fn) : fn();
}

export function createMediaService(port: MediaStoragePort) {
  return {
    async upload(params: Parameters<MediaStoragePort['upload']>[0]) {
      return port.upload(params);
    },
    async getUrl(id: string): Promise<string | null> {
      return port.getUrl(id);
    },
    async getById(id: string): Promise<MediaRecord | null> {
      return port.getById(id);
    },
    async getVideoAttachmentDurationRejection(
      mediaId: string,
      purpose: VideoAttachmentPurpose,
    ) {
      return validateVideoAttachmentDuration(purpose, await port.getById(mediaId));
    },
    async list(params: Parameters<MediaStoragePort['list']>[0]) {
      return port.list(params);
    },
    async updateDisplayName(
      mediaId: string,
      displayName: string | null,
      options?: MediaWriteOptions,
    ) {
      return runMediaWrite(options, () => port.updateDisplayName(mediaId, displayName));
    },
    async findUsage(mediaId: string) {
      return port.findUsage(mediaId);
    },
    async getUsageSummary(mediaId: string) {
      return port.getUsageSummary(mediaId);
    },
    async deleteHard(mediaId: string, options?: MediaWriteOptions) {
      return runMediaWrite(options, () => port.deleteHard(mediaId));
    },
    async updateMediaFolder(mediaId: string, folderId: string | null, options?: MediaWriteOptions) {
      return runMediaWrite(options, () => port.updateMediaFolder(mediaId, folderId));
    },
    async listFolders(parentId: string | null) {
      return port.listFolders(parentId);
    },
    async listAllFolders() {
      return port.listAllFolders();
    },
    async createFolder(
      params: Parameters<MediaStoragePort['createFolder']>[0],
      options?: MediaWriteOptions,
    ) {
      return runMediaWrite(options, () => port.createFolder(params));
    },
    async renameFolder(folderId: string, name: string, options?: MediaWriteOptions) {
      return runMediaWrite(options, () => port.renameFolder(folderId, name));
    },
    async moveFolder(folderId: string, newParentId: string | null, options?: MediaWriteOptions) {
      return runMediaWrite(options, () => port.moveFolder(folderId, newParentId));
    },
    async deleteFolder(folderId: string, options?: MediaWriteOptions) {
      return runMediaWrite(options, () => port.deleteFolder(folderId));
    },
    async folderExists(folderId: string) {
      return port.folderExists(folderId);
    },
  };
}
