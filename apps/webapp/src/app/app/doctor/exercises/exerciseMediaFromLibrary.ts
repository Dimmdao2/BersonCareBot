import type { MediaLibraryPickMeta } from "@/app/app/doctor/content/MediaLibraryPickerDialog";
import type { ExerciseMediaType } from "@/modules/lfk-exercises/types";

/** Maps a library row to persisted `lfk_exercise_media.media_type`. */
export function exerciseMediaTypeFromPick(meta: MediaLibraryPickMeta): ExerciseMediaType {
  if (meta.kind === "video") return "video";
  const mime = meta.mimeType.toLowerCase();
  if (mime === "image/gif" || /\.gif$/i.test(meta.filename)) return "gif";
  return "image";
}
