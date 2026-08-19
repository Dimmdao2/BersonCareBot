import type { MediaLibraryPickMeta } from '@/app/app/doctor/content/MediaLibraryPickerDialog';
import type { ExerciseMediaType } from '@/modules/lfk-exercises/types';

/**
 * Maps a library row to persisted `lfk_exercise_media.media_type`.
 *
 * Файловая часть типа и только она: `hosted_video` сюда не приходит по построению — это ссылка
 * на внешний хостинг, которую в библиотеке файлов выбрать нельзя.
 */
export function exerciseMediaTypeFromPick(
  meta: MediaLibraryPickMeta,
): Exclude<ExerciseMediaType, 'hosted_video'> {
  if (meta.kind === 'video') return 'video';
  const mime = meta.mimeType.toLowerCase();
  if (mime === 'image/gif' || /\.gif$/i.test(meta.filename)) return 'gif';
  return 'image';
}

/** Last path segment extension removed for display as exercise title fallback. */
export function stripFilenameExtension(filename: string): string {
  const f = filename.trim();
  if (!f) return '';
  const i = f.lastIndexOf('.');
  if (i <= 0 || i === f.length - 1) return f;
  return f.slice(0, i);
}

/** Title from CMS display name or original filename without extension. */
export function exerciseTitleFromLibraryItem(item: {
  displayName?: string | null;
  filename: string;
}): string {
  const d = item.displayName?.trim();
  if (d) return d;
  return stripFilenameExtension(item.filename);
}

export function exerciseTitleFromPickMeta(meta: MediaLibraryPickMeta): string {
  return exerciseTitleFromLibraryItem(meta);
}
