import type { ExerciseMedia } from '@/modules/lfk-exercises/types';
import type { MediaPreviewStatus } from '@/modules/media/types';

/**
 * Превью-миниатюра упражнения — первый медиа-элемент из снимка (`snapshot.media[]`).
 * Поля совпадают со снимком элемента программы (`url`/`type`/`previewSmUrl`/…).
 */
export type ExerciseCommentThumbMedia = {
  url: string;
  mediaType: 'image' | 'video' | 'gif';
  previewSmUrl: string | null;
  previewMdUrl: string | null;
  previewStatus: MediaPreviewStatus | null;
  sortOrder: number;
};

/**
 * Достаёт первый медиа-элемент из `snapshot.media[]` (по наименьшему sortOrder).
 */
export function firstSnapshotMedia(
  snapshot: Record<string, unknown>,
): ExerciseCommentThumbMedia | null {
  const raw = snapshot.media;
  if (!Array.isArray(raw)) return null;
  const entries = raw.filter((m): m is Record<string, unknown> => !!m && typeof m === 'object');
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
  const m = sorted[0]!;
  const url =
    typeof m.mediaUrl === 'string'
      ? m.mediaUrl
      : typeof m.url === 'string'
        ? m.url
        : null;
  if (!url) return null;
  const rawMediaType = m.mediaType ?? m.type;
  const mediaType = rawMediaType === 'video' || rawMediaType === 'gif' ? rawMediaType : 'image';
  return {
    url,
    mediaType,
    previewSmUrl: typeof m.previewSmUrl === 'string' ? m.previewSmUrl : null,
    previewMdUrl: typeof m.previewMdUrl === 'string' ? m.previewMdUrl : null,
    previewStatus:
      typeof m.previewStatus === 'string' ? (m.previewStatus as MediaPreviewStatus) : null,
    sortOrder: typeof m.sortOrder === 'number' ? m.sortOrder : 0,
  };
}

/** Маппинг первого медиа снимка упражнения в `ExerciseMedia` для канон-миниатюры. */
export function thumbToExerciseMedia(
  thumb: ExerciseCommentThumbMedia | null | undefined,
): ExerciseMedia | null {
  if (!thumb) return null;
  return {
    id: thumb.url,
    exerciseId: '',
    mediaUrl: thumb.url,
    mediaType: thumb.mediaType,
    sortOrder: thumb.sortOrder,
    createdAt: '',
    previewSmUrl: thumb.previewSmUrl,
    previewMdUrl: thumb.previewMdUrl,
    previewStatus: thumb.previewStatus ?? undefined,
  };
}
