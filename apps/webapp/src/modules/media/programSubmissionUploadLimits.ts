/** Patient program-item submission: image/video subset only (P14–P15). */
export const PROGRAM_SUBMISSION_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

/** Max single file for patient program submission upload: 100 MiB. */
export const MAX_PROGRAM_SUBMISSION_BYTES = 100 * 1024 * 1024;

export const PROGRAM_SUBMISSION_FILE_INPUT_ACCEPT = [
  "image/*",
  "video/*",
  ".heic",
  ".heif",
].join(",");

export function isProgramSubmissionVideoMime(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("video/");
}
