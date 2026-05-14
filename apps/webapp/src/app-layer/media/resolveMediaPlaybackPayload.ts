import { env } from "@/config/env";
import { logger } from "@/app-layer/logging/logger";
import { serializePresignFailureForLog } from "@/app-layer/media/presignLogRedaction";
import { presignGetUrl } from "@/app-layer/media/s3Client";
import { getMediaRowForPlayback } from "@/app-layer/media/s3MediaStorage";
import type { MediaPlaybackPayload } from "@/modules/media/playbackPayloadTypes";
import {
  parseDefaultDeliveryConfig,
  resolveVideoPlaybackDelivery,
  type PlaybackDeliveryStrategy,
} from "@/modules/media/playbackResolveDelivery";
import {
  parseAvailableQualitiesJson,
  parseVideoDeliveryOverride,
  parseVideoProcessingStatus,
} from "@/modules/media/videoHlsFields";
import { recordPlaybackResolutionStat } from "@/app-layer/media/playbackStatsHourly";
import { recordPlaybackUserVideoFirstResolve } from "@/app-layer/media/playbackUserVideoFirstResolve";
import { getVideoPresignTtlSeconds } from "@/app-layer/media/videoPresignTtl";
import { getConfigBool, getConfigValue } from "@/modules/system-settings/configAdapter";
import type { AppSession } from "@/shared/types/session";
import { isTrustedHlsArtifactS3Key, isTrustedPosterS3Key } from "@/shared/lib/hlsStorageLayout";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ResolveMediaPlaybackFailure = { ok: false; status: number; error: string };
export type ResolveMediaPlaybackSuccess = { ok: true; data: MediaPlaybackPayload };

/**
 * Shared by GET /api/media/[id]/playback and RSC (patient content).
 * Master — same-origin HLS proxy; presign — постер и MP4, не сегменты HLS.
 */
export async function resolveMediaPlaybackPayload(input: {
  id: string;
  /** Non-null enforced at call sites (HTTP guard / RSC); reserved for future scoped ACL. */
  session: AppSession;
  adminPrefer: PlaybackDeliveryStrategy | null;
}): Promise<ResolveMediaPlaybackSuccess | ResolveMediaPlaybackFailure> {
  const t0 = performance.now();
  const { id, adminPrefer } = input;
  if (!UUID_RE.test(id) || !(env.DATABASE_URL ?? "").trim()) {
    return { ok: false, status: 404, error: "not found" };
  }

  const playbackEnabled = await getConfigBool("video_playback_api_enabled", false);
  if (!playbackEnabled) {
    return { ok: false, status: 503, error: "feature_disabled" };
  }

  const presignExpiresSec = await getVideoPresignTtlSeconds();

  const defaultRaw = await getConfigValue("video_default_delivery", "auto");
  const systemDefault = parseDefaultDeliveryConfig(defaultRaw, "auto");

  const row = await getMediaRowForPlayback(id);
  if (!row) {
    return { ok: false, status: 404, error: "not found" };
  }

  const mimeType = row.mime_type ?? "";
  const isVideo = mimeType.toLowerCase().startsWith("video/");

  const videoProcessingStatus = parseVideoProcessingStatus(row.video_processing_status);
  const perFileOverride = parseVideoDeliveryOverride(row.video_delivery_override);
  const qualities = parseAvailableQualitiesJson(row.available_qualities_json);

  const progressivePath = `/api/media/${id}`;

  if (!isVideo) {
    logger.info(
      {
        mediaId: id,
        delivery: "file",
        hlsReady: false,
        fallbackUsed: false,
        strategy: systemDefault,
        latencyMs: Math.round(performance.now() - t0),
      },
      "playback_resolved",
    );
    await recordPlaybackResolutionStat({ delivery: "file", fallbackUsed: false });
    return {
      ok: true,
      data: {
        mediaId: id,
        delivery: "file",
        mimeType,
        durationSeconds: row.video_duration_seconds,
        posterUrl: null,
        hls: null,
        mp4: { url: progressivePath },
        fallbackUsed: false,
        expiresInSeconds: presignExpiresSec,
      },
    };
  }

  const rawMaster = row.hls_master_playlist_s3_key?.trim() ?? "";
  const trustedMaster =
    rawMaster && isTrustedHlsArtifactS3Key(id, rawMaster) ? rawMaster : null;

  const resolved = resolveVideoPlaybackDelivery({
    systemDefaultDelivery: systemDefault,
    perFileOverride,
    adminPrefer,
    videoProcessingStatus,
    hlsMasterPlaylistS3Key: trustedMaster,
  });

  let delivery: "hls" | "mp4" = "mp4";
  let fallbackUsed = resolved.fallbackUsed;
  let masterUrl: string | null = null;
  let posterUrl: string | null = null;

  if (resolved.useHls && trustedMaster) {
    delivery = "hls";
    masterUrl = `/api/media/${id}/hls/master.m3u8`;
  } else {
    delivery = "mp4";
  }

  if (delivery === "hls") {
    const rawPoster = row.poster_s3_key?.trim() ?? "";
    if (rawPoster && isTrustedPosterS3Key(id, rawPoster)) {
      try {
        posterUrl = await presignGetUrl(rawPoster, presignExpiresSec);
      } catch (e) {
        logger.error(
          { err: serializePresignFailureForLog(e), mediaId: id, presignTarget: "poster" },
          "playback_presign_failed",
        );
      }
    }
  }

  logger.info(
    {
      mediaId: id,
      delivery,
      hlsReady: resolved.hlsReady,
      fallbackUsed,
      strategy: resolved.strategy,
      latencyMs: Math.round(performance.now() - t0),
    },
    "playback_resolved",
  );

  await recordPlaybackResolutionStat({ delivery, fallbackUsed });

  if (delivery === "hls" || delivery === "mp4") {
    await recordPlaybackUserVideoFirstResolve({
      userId: input.session.user.userId,
      mediaId: id,
    });
  }

  return {
    ok: true,
    data: {
      mediaId: id,
      delivery,
      mimeType,
      durationSeconds: row.video_duration_seconds,
      posterUrl,
      hls: masterUrl ? { masterUrl, qualities: qualities ?? undefined } : null,
      mp4: { url: progressivePath },
      fallbackUsed,
      expiresInSeconds: presignExpiresSec,
    },
  };
}
