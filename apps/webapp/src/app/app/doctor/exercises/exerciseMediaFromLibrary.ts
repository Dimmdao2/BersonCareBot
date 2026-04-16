import type { MediaLibraryPickMeta } from "@/app/app/doctor/content/MediaLibraryPickerDialog";
import type { ExerciseMediaType } from "@/modules/lfk-exercises/types";

/** Maps a library row to persisted `lfk_exercise_media.media_type`. */
export function exerciseMediaTypeFromPick(meta: MediaLibraryPickMeta): ExerciseMediaType {
  if (meta.kind === "video") return "video";
  const mime = meta.mimeType.toLowerCase();
  if (mime === "image/gif" || /\.gif$/i.test(meta.filename)) return "gif";
  return "image";
}

/** Last path segment extension removed for display as exercise title fallback. */
export function stripFilenameExtension(filename: string): string {
  const f = filename.trim();
  if (!f) return "";
  const i = f.lastIndexOf(".");
  if (i <= 0 || i === f.length - 1) return f;
  return f.slice(0, i);
}

/** Title from CMS display name or original filename without extension. */
export function exerciseTitleFromLibraryItem(item: { displayName?: string | null; filename: string }): string {
  const d = item.displayName?.trim();
  if (d) return d;
  return stripFilenameExtension(item.filename);
}

export function exerciseTitleFromPickMeta(meta: MediaLibraryPickMeta): string {
  return exerciseTitleFromLibraryItem(meta);
}
