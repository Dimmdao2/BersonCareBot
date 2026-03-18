import type { MediaStoragePort } from "./ports";
import type { MediaRecord } from "./types";

export type { MediaRecord } from "./types";
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
  };
}
