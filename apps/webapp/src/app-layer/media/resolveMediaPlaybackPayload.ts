import { env, webappRuntimeDatabaseIsConfigured } from '@/config/env';
import { logger } from '@/app-layer/logging/logger';
import { serializePresignFailureForLog } from '@/app-layer/media/presignLogRedaction';
import { presignDeliveryGetUrl } from '@/app-layer/media/s3DeliveryClient';
import { getMediaRowForPlayback } from '@/app-layer/media/s3MediaStorage';
import type { MediaPlaybackPayload } from '@/modules/media/playbackPayloadTypes';
import { isHlsAssetReady } from '@/modules/media/playbackResolveDelivery';
import {
  parseAvailableQualitiesJson,
  parseVideoProcessingStatus,
} from '@/modules/media/videoHlsFields';
import { recordPlaybackResolutionEvent } from '@/app-layer/media/playbackResolutionEvents';
import { recordPlaybackResolutionStat } from '@/app-layer/media/playbackStatsHourly';
import { recordPlaybackUserVideoFirstResolve } from '@/app-layer/media/playbackUserVideoFirstResolve';
import { getVideoPresignTtlSeconds } from '@/app-layer/media/videoPresignTtl';
import { getPatientRuntimeBool } from '@/modules/system-settings/configAdapter';
import { canAccessProgramSubmissionMedia } from '@/modules/media/programSubmissionPlaybackAccess';
import type { AppSession } from '@/shared/types/session';
import { isTrustedHlsArtifactS3Key, isTrustedPosterS3Key } from '@/shared/lib/hlsStorageLayout';
import { mediaPreviewUrlById } from '@/shared/lib/mediaPreviewUrls';
import type { MediaPreviewStatus } from '@/modules/media/types';
import {
  databaseNameFromUrl,
  isSaasTestLocalMediaAllowed,
} from '@/app-layer/media/localSaasTestFixtureMedia';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ResolveMediaPlaybackFailure = { ok: false; status: number; error: string };
export type ResolveMediaPlaybackSuccess = { ok: true; data: MediaPlaybackPayload };

/**
 * Shared by GET /api/media/[id]/playback and RSC (patient content).
 * Master — same-origin HLS proxy; presign — только постер из горячего бакета.
 * Изображение получает `/api/media/:id` лишь после стандартного рендишна. Видео получает только
 * HLS; исходный MP4 больше не является временным playback fallback. Документы и аудио, для которых
 * наш энкодер не строит вывод, встроенного просмотра не получают.
 */
export async function resolveMediaPlaybackPayload(input: {
  id: string;
  /** Non-null enforced at call sites (HTTP guard / RSC); reserved for future scoped ACL. */
  session: AppSession;
  allowPlatformBase?: boolean;
}): Promise<ResolveMediaPlaybackSuccess | ResolveMediaPlaybackFailure> {
  const t0 = performance.now();
  const { id } = input;
  if (!UUID_RE.test(id) || !webappRuntimeDatabaseIsConfigured()) {
    return { ok: false, status: 404, error: 'not found' };
  }

  const legacyDatabaseUrl = env.DATABASE_URL ?? '';
  const row = await getMediaRowForPlayback(id, {
    allowLocalSaasTestFixture: databaseNameFromUrl(legacyDatabaseUrl) === 'bersoncarebot_test',
    allowPlatformBase: input.allowPlatformBase === true,
  });
  if (!row) {
    return { ok: false, status: 404, error: 'not found' };
  }

  const localSaasTestFixture = isSaasTestLocalMediaAllowed({
    databaseUrl: legacyDatabaseUrl,
    storedPath: row.stored_path,
    s3Key: row.s3_key,
    mimeType: row.mime_type,
  });
  const playbackEnabled = await getPatientRuntimeBool('video_playback_api_enabled');
  if (!playbackEnabled && !localSaasTestFixture) {
    return { ok: false, status: 503, error: 'feature_disabled' };
  }

  const presignExpiresSec = await getVideoPresignTtlSeconds();

  if (
    !canAccessProgramSubmissionMedia(input.session, {
      usagePurpose: row.usage_purpose,
      uploadedBy: row.uploaded_by,
    })
  ) {
    return { ok: false, status: 403, error: 'forbidden' };
  }

  const recordPatientPlaybackTelemetry =
    input.session.user.role === 'client' && row.usage_purpose !== 'program_item_submission';
  const mimeType = row.mime_type ?? '';
  const isVideo = mimeType.toLowerCase().startsWith('video/');
  const previewStatus: MediaPreviewStatus =
    row.preview_status === 'ready' ||
    row.preview_status === 'failed' ||
    row.preview_status === 'skipped'
      ? row.preview_status
      : 'pending';
  const preview = {
    status: previewStatus,
    smUrl:
      previewStatus === 'ready' && row.preview_sm_key?.trim()
        ? mediaPreviewUrlById(id, 'sm')
        : null,
    mdUrl:
      previewStatus === 'ready' && row.preview_md_key?.trim()
        ? mediaPreviewUrlById(id, 'md')
        : null,
    standardRendition: row.standard_rendition_at != null,
  };

  const videoProcessingStatus = parseVideoProcessingStatus(row.video_processing_status);
  const qualities = parseAvailableQualitiesJson(row.available_qualities_json);

  const progressivePath = `/api/media/${id}`;

  if (!isVideo) {
    if (!mimeType.toLowerCase().startsWith('image/')) {
      return { ok: false, status: 404, error: 'inline_preview_unavailable' };
    }
    if (row.standard_rendition_at == null) {
      return { ok: false, status: 409, error: 'media_processing' };
    }
    logger.info(
      {
        mediaId: id,
        delivery: 'file',
        hlsReady: false,
        latencyMs: Math.round(performance.now() - t0),
      },
      'playback_resolved',
    );
    if (recordPatientPlaybackTelemetry) {
      const userId = input.session.user.userId;
      await recordPlaybackResolutionStat({ userId, mediaId: id, delivery: 'file' });
      await recordPlaybackResolutionEvent({ userId, mediaId: id, delivery: 'file' });
    }
    return {
      ok: true,
      data: {
        mediaId: id,
        delivery: 'file',
        mimeType,
        durationSeconds: row.video_duration_seconds,
        posterUrl: null,
        preview,
        hls: null,
        progressive: { url: progressivePath },
        expiresInSeconds: presignExpiresSec,
      },
    };
  }

  const rawMaster = row.hls_master_playlist_s3_key?.trim() ?? '';
  const trustedMaster = rawMaster && isTrustedHlsArtifactS3Key(id, rawMaster) ? rawMaster : null;

  const hlsReady = isHlsAssetReady(videoProcessingStatus, trustedMaster);

  if (!hlsReady) {
    return { ok: false, status: 409, error: 'media_processing' };
  }

  const delivery = 'hls' as const;
  const masterUrl = `/api/media/${id}/hls/master.m3u8`;
  let posterUrl: string | null = null;

  const rawPoster = row.poster_s3_key?.trim() ?? '';
  if (rawPoster && isTrustedPosterS3Key(id, rawPoster)) {
    try {
      posterUrl = await presignDeliveryGetUrl(rawPoster, presignExpiresSec, row.storage_target);
    } catch (e) {
      logger.error(
        { err: serializePresignFailureForLog(e), mediaId: id, presignTarget: 'poster' },
        'playback_presign_failed',
      );
    }
  }

  logger.info(
    {
      mediaId: id,
      delivery,
      hlsReady,
      latencyMs: Math.round(performance.now() - t0),
    },
    'playback_resolved',
  );

  if (recordPatientPlaybackTelemetry) {
    const userId = input.session.user.userId;
    await recordPlaybackResolutionStat({ userId, mediaId: id, delivery });
    await recordPlaybackResolutionEvent({ userId, mediaId: id, delivery });
    await recordPlaybackUserVideoFirstResolve({ userId, mediaId: id });
  }

  return {
    ok: true,
    data: {
      mediaId: id,
      delivery,
      mimeType,
      durationSeconds: row.video_duration_seconds,
      posterUrl,
      preview,
      hls: { masterUrl, qualities: qualities ?? undefined },
      progressive: null,
      expiresInSeconds: presignExpiresSec,
    },
  };
}
