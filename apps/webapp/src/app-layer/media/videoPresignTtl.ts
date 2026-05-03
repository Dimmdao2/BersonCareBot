import { getConfigPositiveInt } from "@/modules/system-settings/configAdapter";
import {
  VIDEO_PRESIGN_TTL_DEFAULT_SEC,
  VIDEO_PRESIGN_TTL_MAX_SEC,
  VIDEO_PRESIGN_TTL_MIN_SEC,
} from "@/modules/media/videoPresignTtlConstants";

/**
 * TTL for presigned GET to private media (playback JSON + `GET /api/media/[id]` redirect).
 * Stored in `system_settings` (`video_presign_ttl_seconds`, admin scope).
 */
export async function getVideoPresignTtlSeconds(): Promise<number> {
  return getConfigPositiveInt("video_presign_ttl_seconds", VIDEO_PRESIGN_TTL_DEFAULT_SEC, {
    min: VIDEO_PRESIGN_TTL_MIN_SEC,
    max: VIDEO_PRESIGN_TTL_MAX_SEC,
  });
}

export {
  VIDEO_PRESIGN_TTL_DEFAULT_SEC,
  VIDEO_PRESIGN_TTL_MAX_SEC,
  VIDEO_PRESIGN_TTL_MIN_SEC,
} from "@/modules/media/videoPresignTtlConstants";
