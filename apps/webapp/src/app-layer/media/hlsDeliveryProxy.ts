import { NextResponse } from 'next/server';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { logger } from '@/app-layer/logging/logger';
import { buildTrustedPrivateObjectUrlPrefixes } from '@/app-layer/media/hlsTrustedOriginPrefixes';
import { rewriteM3u8AbsoluteUrls } from '@/app-layer/media/hlsPlaylistRewrite';
import {
  hlsArtifactObjectKey,
  hlsArtifactQualityFromPath,
  hlsArtifactSupportsHttpRange,
  inferHlsArtifactKind,
  isHlsPlaylistPath,
  normalizeHlsUrlPathSegments,
} from '@/app-layer/media/hlsProxyPath';
import { recordHlsDeliveryBytes } from '@/app-layer/media/hlsDeliveryByteMeter';
import { parseSingleBytesRangeHeader } from '@/app-layer/media/hlsProxyRange';
import { getMediaRowForPlayback } from '@/app-layer/media/s3MediaStorage';
import {
  s3GetObjectStream,
  s3GetPrivateObjectBuffer,
  type S3GetObjectStreamFailureReason,
} from '@/app-layer/media/s3Client';
import {
  recordMediaHlsProxyErrorEventIfNeeded,
  shouldRecordMediaHlsProxyError,
} from '@/app-layer/media/hlsProxyErrorEvents';
import type { HlsProxyArtifactKind, HlsProxyReasonCodeDb } from '@/modules/media/hlsProxyTelemetry';
import { bindHlsProxyStreamToClientAbort } from '@/app-layer/media/hlsProxyClientAbortStream';
import { isTrustedHlsArtifactS3Key } from '@/shared/lib/hlsStorageLayout';

/**
 * Guards the ENTIRE metering call, not just `recordHlsDeliveryBytes`'s own body: the owner's
 * "запись не имеет права сорвать выдачу" covers argument evaluation too — `getCurrentDbPrincipal-
 * OrganizationId()` and `hlsArtifactQualityFromPath()` run before `recordHlsDeliveryBytes`'s internal
 * try/catch even starts, so a throw from either would otherwise still turn a served segment into a
 * 502 `internal_error` through the outer handler's catch in `handleHlsDeliveryProxyRequest`.
 */
function recordHlsDeliveryBytesSafely(build: () => Parameters<typeof recordHlsDeliveryBytes>[0]): void {
  try {
    recordHlsDeliveryBytes(build());
  } catch (e) {
    logger.error({ err: e }, 'hls_delivery_byte_meter_call_site_failed');
  }
}

function contentTypeForArtifact(segments: string[], fromS3: string | undefined): string {
  if (fromS3 && fromS3.trim()) return fromS3;
  const last = segments[segments.length - 1] ?? '';
  const low = last.toLowerCase();
  if (low.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (low.endsWith('.ts')) return 'video/mp2t';
  if (low.endsWith('.m4s')) return 'video/iso.segment';
  if (low.endsWith('.mp4')) return 'video/mp4';
  if (low.endsWith('.aac')) return 'audio/aac';
  if (low.endsWith('.vtt')) return 'text/vtt';
  return 'application/octet-stream';
}

function mapS3FailureToReason(
  r: S3GetObjectStreamFailureReason,
  ctx: 'playlist' | 'segment',
): HlsProxyReasonCodeDb {
  if (ctx === 'playlist' && r === 's3_read_failed') return 'playlist_read_failed';
  return r;
}

function httpStatusForReason(reason: HlsProxyReasonCodeDb): number {
  switch (reason) {
    case 'session_unauthorized':
      return 401;
    case 'feature_disabled':
      return 503;
    case 'media_not_readable':
    case 'forbidden_path':
    case 'missing_object':
      return 404;
    case 'range_not_satisfiable':
      return 416;
    case 'internal_error':
      return 502;
    default:
      return 502;
  }
}

async function finishError(params: {
  mediaId: string;
  userId: string;
  allowPlatformBase?: boolean;
  reason: HlsProxyReasonCodeDb;
  artifactKind: HlsProxyArtifactKind;
  objectKey: string;
}): Promise<Response> {
  const http = httpStatusForReason(params.reason);
  if (shouldRecordMediaHlsProxyError(params.reason)) {
    await recordMediaHlsProxyErrorEventIfNeeded({
      mediaId: params.mediaId,
      userId: params.userId,
      reasonCode: params.reason,
      httpStatus: http,
      artifactKind: params.artifactKind,
      objectSuffix: params.objectKey,
    });
  }
  logger.warn(
    {
      mediaId: params.mediaId,
      reasonCode: params.reason,
      artifactKind: params.artifactKind,
      httpStatus: http,
    },
    'hls_proxy_error',
  );

  const body =
    params.reason === 'media_not_readable' ||
    params.reason === 'missing_object' ||
    params.reason === 'forbidden_path'
      ? { error: 'not found' }
      : params.reason === 'range_not_satisfiable'
        ? { error: 'range_not_satisfiable' }
        : { error: 'bad_gateway' };

  return NextResponse.json(body, { status: http });
}

/**
 * Authorized HLS artifact delivery via webapp (master → variants → segments).
 * Caller must enforce session + `video_playback_api_enabled` before invoking.
 */
export async function handleHlsDeliveryProxyRequest(input: {
  mediaId: string;
  pathSegments: string[] | undefined;
  rangeHeader: string | null;
  userId: string;
  allowPlatformBase?: boolean;
  clientAbortSignal?: AbortSignal | null;
}): Promise<Response> {
  const { mediaId, userId } = input;
  try {
    return await runHlsDeliveryProxy(input);
  } catch (err) {
    logger.error({ err, mediaId }, 'hls_proxy_unhandled_exception');
    return finishError({
      mediaId,
      userId,
      reason: 'internal_error',
      artifactKind: 'segment',
      objectKey: '',
    });
  }
}

async function runHlsDeliveryProxy(input: {
  mediaId: string;
  pathSegments: string[] | undefined;
  rangeHeader: string | null;
  userId: string;
  allowPlatformBase?: boolean;
  clientAbortSignal?: AbortSignal | null;
}): Promise<Response> {
  const { mediaId, userId } = input;

  const normalized = normalizeHlsUrlPathSegments(input.pathSegments);
  if (!normalized.ok) {
    return finishError({
      mediaId,
      userId,
      reason: 'forbidden_path',
      artifactKind: 'segment',
      objectKey: '',
    });
  }

  const segments = normalized.segments;
  const artifactKind = inferHlsArtifactKind(segments);
  const objectKey = hlsArtifactObjectKey(mediaId, segments);

  if (!isTrustedHlsArtifactS3Key(mediaId, objectKey)) {
    return finishError({
      mediaId,
      userId,
      reason: 'forbidden_path',
      artifactKind,
      objectKey,
    });
  }

  const row = await getMediaRowForPlayback(mediaId, {
    allowPlatformBase: input.allowPlatformBase === true,
  });
  if (!row) {
    return finishError({
      mediaId,
      userId,
      reason: 'media_not_readable',
      artifactKind,
      objectKey,
    });
  }

  const trustedPrefixes = buildTrustedPrivateObjectUrlPrefixes();

  if (isHlsPlaylistPath(segments)) {
    const range = parseSingleBytesRangeHeader(input.rangeHeader);
    if (range.kind === 'invalid') {
      return finishError({
        mediaId,
        userId,
        reason: 'range_not_satisfiable',
        artifactKind,
        objectKey,
      });
    }

    const bufResult = await s3GetPrivateObjectBuffer(objectKey, row.storage_target);
    if (!bufResult.ok) {
      const reason = mapS3FailureToReason(bufResult.reason, 'playlist');
      return finishError({ mediaId, userId, reason, artifactKind, objectKey });
    }

    let text = bufResult.buf.toString('utf8');
    try {
      text = rewriteM3u8AbsoluteUrls(text, mediaId, trustedPrefixes);
    } catch {
      return finishError({
        mediaId,
        userId,
        reason: 'playlist_rewrite_failed',
        artifactKind,
        objectKey,
      });
    }

    recordHlsDeliveryBytesSafely(() => ({
      organizationId: getCurrentDbPrincipalOrganizationId(),
      userId,
      mediaId,
      quality: hlsArtifactQualityFromPath(segments),
      bytes: Buffer.byteLength(text, 'utf8'),
    }));

    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'private, max-age=0, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  let awsRange: string | null = null;
  if (hlsArtifactSupportsHttpRange(segments)) {
    const parsed = parseSingleBytesRangeHeader(input.rangeHeader);
    if (parsed.kind === 'invalid') {
      return finishError({
        mediaId,
        userId,
        reason: 'range_not_satisfiable',
        artifactKind,
        objectKey,
      });
    }
    if (parsed.kind === 'range') awsRange = parsed.awsHeader;
  } else if (input.rangeHeader?.trim()) {
    const parsed = parseSingleBytesRangeHeader(input.rangeHeader);
    if (parsed.kind === 'invalid') {
      return finishError({
        mediaId,
        userId,
        reason: 'range_not_satisfiable',
        artifactKind,
        objectKey,
      });
    }
  }

  const streamed = await s3GetObjectStream({
    key: objectKey,
    range: awsRange,
    target: row.storage_target,
  });
  if (!streamed.ok) {
    const reason = mapS3FailureToReason(streamed.reason, 'segment');
    return finishError({ mediaId, userId, reason, artifactKind, objectKey });
  }

  const ct = contentTypeForArtifact(segments, streamed.contentType);
  const headers = new Headers({
    'Content-Type': ct,
    'Accept-Ranges': 'bytes',
    // Неделя вместо часа (владелец 11.09.2026: «кеш сегментов — на два дня вообще можно, можно на
    // неделю»). Сегмент неизменяем: его адрес содержит media id, а смена видео меняет id, значит меняет
    // адрес — вчерашние байты по этому адресу отдать невозможно. `immutable` говорит браузеру не
    // переспрашивать вовсе.
    //
    // Зачем: по замеру истории прода одна пара «пациент + видео» открывается 4,3 раза в месяц, и при
    // часовом кэше каждое повторное открытие качало те же байты заново. Кэш ловит только повторы внутри
    // окна, поэтому неделя забирает почти все реальные повторы, а не их часть.
    //
    // `private` остаётся: выдача авторизована на каждый сегмент, и промежуточным кэшам её хранить нельзя.
    'Cache-Control': 'private, max-age=604800, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  if (streamed.contentLength != null && Number.isFinite(streamed.contentLength)) {
    headers.set('Content-Length', String(streamed.contentLength));
  }
  if (streamed.contentRange) headers.set('Content-Range', streamed.contentRange);
  if (streamed.eTag) headers.set('ETag', streamed.eTag);

  // `streamed.contentLength` is S3's own `ContentLength` for this exact response: the length of the
  // full object for a plain GET, the length of the returned range for a ranged GET (RFC 7233 — a 206
  // response's `Content-Length` is the bytes actually sent, not the resource's total size, which
  // instead lives in `Content-Range`). Counting anything derived from `Content-Range` here would
  // double the byte count for the many partial re-fetches an HLS player does while seeking.
  recordHlsDeliveryBytesSafely(() => ({
    organizationId: getCurrentDbPrincipalOrganizationId(),
    userId,
    mediaId,
    quality: hlsArtifactQualityFromPath(segments),
    bytes: streamed.contentLength ?? 0,
  }));

  const body = bindHlsProxyStreamToClientAbort(streamed.stream, input.clientAbortSignal);

  return new Response(body, {
    status: streamed.httpStatus,
    headers,
  });
}
