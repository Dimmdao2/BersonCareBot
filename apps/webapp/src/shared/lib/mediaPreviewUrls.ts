/**
 * Canonical helpers for library media preview URLs (stable app paths).
 * All preview URL construction for `/api/media/:id` should go through this module.
 * Single source of truth for preview URL building. Do not duplicate.
 */

/** Parse UUID from `/api/media/{uuid}` with optional trailing slash. */
export const API_MEDIA_ID_RE =
  /^\/api\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i;

export type MediaPreviewSize = 'sm' | 'md';

/** Stable app URL for a generated preview JPEG. */
export function mediaPreviewUrlById(mediaId: string, size: MediaPreviewSize): string {
  return `/api/media/${mediaId}/preview/${size}`;
}

/** Preview sm URL from a library media app URL, or null if not a bare `/api/media/{uuid}`. */
export function mediaPreviewSmUrl(mediaAppUrl: string): string | null {
  const m = mediaAppUrl.trim().match(API_MEDIA_ID_RE);
  return m ? mediaPreviewUrlById(m[1]!, 'sm') : null;
}

/** Preview md URL from a library media app URL, or null if not a bare `/api/media/{uuid}`. */
export function mediaPreviewMdUrl(mediaAppUrl: string): string | null {
  const m = mediaAppUrl.trim().match(API_MEDIA_ID_RE);
  return m ? mediaPreviewUrlById(m[1]!, 'md') : null;
}

/** Lowercase `media_files.id` from a bare `/api/media/{uuid}` app URL, or null. */
export function parseMediaFileIdFromAppUrl(mediaAppUrl: string): string | null {
  const m = mediaAppUrl.trim().match(API_MEDIA_ID_RE);
  return m ? m[1]!.toLowerCase() : null;
}

const EMBEDDED_API_MEDIA_ID_RE =
  /\/api\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?![0-9a-f-])/gi;

/** Unique library media UUIDs referenced anywhere in Markdown or legacy HTML. */
export function parseMediaFileIdsFromText(value: string): string[] {
  const ids = new Set<string>();
  for (const match of value.matchAll(EMBEDDED_API_MEDIA_ID_RE)) {
    ids.add(match[1]!.toLowerCase());
  }
  return [...ids];
}
