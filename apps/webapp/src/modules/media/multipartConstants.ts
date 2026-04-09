/** Default part size for multipart uploads (except last part). */
export const MULTIPART_DEFAULT_PART_BYTES = 32 * 1024 * 1024;

/** Max parts per S3 multipart upload. */
export const MULTIPART_MAX_PARTS = 10_000;

/** Session TTL from init (browser must complete within this window). */
export const MULTIPART_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Choose part size: single part if file fits in default chunk; else default chunk size.
 * Ensures part count stays within S3 limits for max file size (3 GiB).
 */
export function chooseMultipartPartSize(totalBytes: number): number {
  if (totalBytes <= 0) return MULTIPART_DEFAULT_PART_BYTES;
  if (totalBytes <= MULTIPART_DEFAULT_PART_BYTES) {
    return totalBytes;
  }
  const parts = Math.ceil(totalBytes / MULTIPART_DEFAULT_PART_BYTES);
  if (parts <= MULTIPART_MAX_PARTS) {
    return MULTIPART_DEFAULT_PART_BYTES;
  }
  return Math.ceil(totalBytes / MULTIPART_MAX_PARTS);
}

export function multipartMaxPartNumber(expectedSizeBytes: number, partSizeBytes: number): number {
  if (partSizeBytes <= 0) return 1;
  return Math.ceil(expectedSizeBytes / partSizeBytes);
}
