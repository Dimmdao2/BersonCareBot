import type { MediaListItem } from "@/shared/ui/doctor/media/MediaPickerList";

export type MediaLibraryPickerListCacheEntry = {
  items: MediaListItem[];
  hasMore: boolean;
  nextOffset: number;
  total: number | null;
};

/** Server-fetched rows keyed by full `listUrl` (kind, folder, sort, q, limit; offset always 0). */
const mediaLibraryPickerListCache = new Map<string, MediaLibraryPickerListCacheEntry>();

export function getMediaLibraryPickerListCached(listUrl: string): MediaLibraryPickerListCacheEntry | undefined {
  return mediaLibraryPickerListCache.get(listUrl);
}

export function setMediaLibraryPickerListCached(
  listUrl: string,
  entry: MediaLibraryPickerListCacheEntry,
): void {
  mediaLibraryPickerListCache.set(listUrl, entry);
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
