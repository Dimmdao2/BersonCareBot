import type { VideoDeliveryOverride, VideoProcessingStatus } from "./types";

/** User-facing strategy (system_settings, per-file override, or ?prefer= for admin). */
export type PlaybackDeliveryStrategy = "mp4" | "hls" | "auto";

export type ResolveVideoPlaybackInput = {
  /** Normalized `system_settings.video_default_delivery`. */
  systemDefaultDelivery: PlaybackDeliveryStrategy;
  /** `media_files.video_delivery_override` when set. */
  perFileOverride: VideoDeliveryOverride | null;
  /** `?prefer=` — only applied when requester is admin. */
  adminPrefer: PlaybackDeliveryStrategy | null;
  videoProcessingStatus: VideoProcessingStatus | null;
  /** Raw DB column; readiness also requires status === ready. */
  hlsMasterPlaylistS3Key: string | null;
};

export type ResolveVideoPlaybackResult = {
  /** Prefer HLS master URL vs legacy `/api/media/:id` progressive path. */
  useHls: boolean;
  /** Strategy after merge (per-row > admin query > system). */
  strategy: PlaybackDeliveryStrategy;
  hlsReady: boolean;
  /** True when strategy asked for HLS but output is progressive (MP4) because HLS is not ready. */
  fallbackUsed: boolean;
};

function normalizeStrategy(raw: string): PlaybackDeliveryStrategy | null {
  const s = raw.trim().toLowerCase();
  if (s === "mp4" || s === "hls" || s === "auto") return s;
  return null;
}

/** Read `video_default_delivery` from config string (DB or env fallback). */
export function parseDefaultDeliveryConfig(raw: string, fallback: PlaybackDeliveryStrategy): PlaybackDeliveryStrategy {
  return normalizeStrategy(raw) ?? fallback;
}

export function isHlsAssetReady(
  videoProcessingStatus: VideoProcessingStatus | null,
  hlsMasterPlaylistS3Key: string | null,
): boolean {
  return (
    videoProcessingStatus === "ready" && Boolean(hlsMasterPlaylistS3Key?.trim())
  );
}

/**
 * Pure delivery resolution for **video/** MIME rows.
 * Does not presign; caller supplies DB flags and keys.
 */
export function resolveVideoPlaybackDelivery(input: ResolveVideoPlaybackInput): ResolveVideoPlaybackResult {
  const hlsReady = isHlsAssetReady(input.videoProcessingStatus, input.hlsMasterPlaylistS3Key);
  const strategy: PlaybackDeliveryStrategy =
    input.perFileOverride ?? input.adminPrefer ?? input.systemDefaultDelivery;

  let useHls = false;
  let fallbackUsed = false;

  if (strategy === "mp4") {
    useHls = false;
  } else if (strategy === "hls") {
    if (hlsReady) {
      useHls = true;
    } else {
      useHls = false;
      fallbackUsed = true;
    }
  } else {
    // auto
    if (hlsReady) {
      useHls = true;
    } else {
      useHls = false;
    }
  }

  return { useHls, strategy, hlsReady, fallbackUsed };
}
