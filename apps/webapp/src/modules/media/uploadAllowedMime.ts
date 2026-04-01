/** Shared MIME allowlist for CMS media upload and presign (must match magic-byte checks in upload route). */
export const ALLOWED_MEDIA_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
  "application/pdf",
]);

/** Max single file size for presigned S3 upload: 2 GiB. */
export const MAX_MEDIA_BYTES = 2 * 1024 * 1024 * 1024;

/** Max single file size for server-proxy upload (markdown toolbar).
 *  Proxy buffers the full body in Node memory, so keep this low. */
export const MAX_PROXY_UPLOAD_BYTES = 50 * 1024 * 1024;
