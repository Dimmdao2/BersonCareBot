/** Shared numeric bounds for presigned GET TTL (private S3). Server + client safe — no DB imports. */

export const VIDEO_PRESIGN_TTL_DEFAULT_SEC = 3600;
export const VIDEO_PRESIGN_TTL_MIN_SEC = 60;
/** AWS SigV4 presigned URL upper bound (7 days). */
export const VIDEO_PRESIGN_TTL_MAX_SEC = 604800;
