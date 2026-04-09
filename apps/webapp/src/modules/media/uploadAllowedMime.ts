/** Shared MIME allowlist for CMS media upload and presign (must match magic-byte checks in upload route). */
export const ALLOWED_MEDIA_MIME = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/tiff",
  /** SVG: treat as download-only in UI; do not inline unsanitized in &lt;img&gt;. */
  "image/svg+xml",
  // Video
  "video/mp4",
  "video/quicktime",
  "video/webm",
  // Audio
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);

/** Max single file size for presigned / multipart S3 upload: 3 GiB. */
export const MAX_MEDIA_BYTES = 3 * 1024 * 1024 * 1024;

/** Max single file size for server-proxy upload (markdown toolbar).
 *  Proxy buffers the full body in Node memory, so keep this low. */
export const MAX_PROXY_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * HTML `accept` for CMS file pickers — mirrors ALLOWED_MEDIA_MIME (browser/OS support varies).
 * HEIC/HEIF as extensions: iOS may not map them to image/* alone.
 */
export const FILE_INPUT_ACCEPT = [
  "image/*",
  "video/*",
  "audio/*",
  ".heic",
  ".heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
].join(",");
