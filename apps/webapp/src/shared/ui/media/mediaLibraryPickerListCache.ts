import type { MediaListItem } from "@/shared/ui/media/MediaPickerList";

/** Server-fetched rows keyed by full `listUrl` (kind, folder, sort, limit). */
const mediaLibraryPickerListCache = new Map<string, MediaListItem[]>();

export function getMediaLibraryPickerListCached(listUrl: string): MediaListItem[] | undefined {
  return mediaLibraryPickerListCache.get(listUrl);
}

export function setMediaLibraryPickerListCached(listUrl: string, items: MediaListItem[]): void {
  mediaLibraryPickerListCache.set(listUrl, items);
}

/**
 * Drop cached list responses (e.g. after upload). Omit `listUrl` to clear all keys.
 */
export function invalidateMediaLibraryPickerListCache(listUrl?: string): void {
  if (listUrl === undefined) {
    mediaLibraryPickerListCache.clear();
    return;
  }
  mediaLibraryPickerListCache.delete(listUrl);
}
