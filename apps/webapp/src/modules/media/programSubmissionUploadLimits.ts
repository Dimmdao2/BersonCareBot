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

/** Max single file for patient program submission upload: 250 MiB. */
export const MAX_PROGRAM_SUBMISSION_BYTES = 250 * 1024 * 1024;

export const PROGRAM_SUBMISSION_FILE_INPUT_ACCEPT = [
  "image/*",
  "video/*",
  ".heic",
  ".heif",
].join(",");

export function isProgramSubmissionVideoMime(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("video/");
}

export function normalizeProgramSubmissionMime(mimeType: string): string {
  return mimeType.trim().toLowerCase();
}

export function isAllowedProgramSubmissionMime(mimeType: string): boolean {
  return PROGRAM_SUBMISSION_ALLOWED_MIME.has(normalizeProgramSubmissionMime(mimeType));
}

/** Validates S3 HEAD against presign-declared metadata (P14). */
export function validateProgramSubmissionS3Head(params: {
  declaredMime: string;
  declaredSizeBytes: number;
  contentLength: number;
  contentType: string | undefined;
}): { ok: true } | { ok: false; error: "file_too_large" | "mime_not_allowed" } {
  if (!Number.isFinite(params.contentLength) || params.contentLength <= 0) {
    return { ok: false, error: "mime_not_allowed" };
  }
  if (params.contentLength > MAX_PROGRAM_SUBMISSION_BYTES) {
    return { ok: false, error: "file_too_large" };
  }
  const headMime = params.contentType ? normalizeProgramSubmissionMime(params.contentType) : "";
  const declaredMime = normalizeProgramSubmissionMime(params.declaredMime);
  const effectiveMime =
    headMime && headMime !== "application/octet-stream" && isAllowedProgramSubmissionMime(headMime)
      ? headMime
      : declaredMime;
  if (!isAllowedProgramSubmissionMime(effectiveMime)) {
    return { ok: false, error: "mime_not_allowed" };
  }
  return { ok: true };
}
