import { NextResponse } from "next/server";
import { logger } from "@/app-layer/logging/logger";
import { buildTrustedPrivateObjectUrlPrefixes } from "@/app-layer/media/hlsTrustedOriginPrefixes";
import { rewriteM3u8AbsoluteUrls } from "@/app-layer/media/hlsPlaylistRewrite";
import {
  hlsArtifactObjectKey,
  hlsArtifactSupportsHttpRange,
  inferHlsArtifactKind,
  isHlsPlaylistPath,
  normalizeHlsUrlPathSegments,
} from "@/app-layer/media/hlsProxyPath";
import { parseSingleBytesRangeHeader } from "@/app-layer/media/hlsProxyRange";
import { getMediaRowForPlayback } from "@/app-layer/media/s3MediaStorage";
import {
  s3GetObjectStream,
  s3GetPrivateObjectBuffer,
  type S3GetObjectStreamFailureReason,
} from "@/app-layer/media/s3Client";
import {
  recordMediaHlsProxyErrorEventIfNeeded,
  shouldRecordMediaHlsProxyError,
} from "@/app-layer/media/hlsProxyErrorEvents";
import type { HlsProxyArtifactKind, HlsProxyReasonCodeDb } from "@/modules/media/hlsProxyTelemetry";
import { isTrustedHlsArtifactS3Key } from "@/shared/lib/hlsStorageLayout";

function contentTypeForArtifact(segments: string[], fromS3: string | undefined): string {
  if (fromS3 && fromS3.trim()) return fromS3;
  const last = segments[segments.length - 1] ?? "";
  const low = last.toLowerCase();
  if (low.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (low.endsWith(".ts")) return "video/mp2t";
  if (low.endsWith(".m4s")) return "video/iso.segment";
  if (low.endsWith(".mp4")) return "video/mp4";
  if (low.endsWith(".aac")) return "audio/aac";
  if (low.endsWith(".vtt")) return "text/vtt";
  return "application/octet-stream";
}

function mapS3FailureToReason(
  r: S3GetObjectStreamFailureReason,
  ctx: "playlist" | "segment",
): HlsProxyReasonCodeDb {
  if (ctx === "playlist" && r === "s3_read_failed") return "playlist_read_failed";
  return r;
}

function httpStatusForReason(reason: HlsProxyReasonCodeDb): number {
  switch (reason) {
    case "session_unauthorized":
      return 401;
    case "feature_disabled":
      return 503;
    case "media_not_readable":
    case "forbidden_path":
    case "missing_object":
      return 404;
    case "range_not_satisfiable":
      return 416;
    case "internal_error":
      return 502;
    default:
      return 502;
  }
}

async function finishError(params: {
  mediaId: string;
  userId: string;
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
    "hls_proxy_error",
  );

  const body =
    params.reason === "media_not_readable" || params.reason === "missing_object" || params.reason === "forbidden_path"
      ? { error: "not found" }
      : params.reason === "range_not_satisfiable"
        ? { error: "range_not_satisfiable" }
        : { error: "bad_gateway" };

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
}): Promise<Response> {
  const { mediaId, userId } = input;
  try {
    return await runHlsDeliveryProxy(input);
  } catch (err) {
    logger.error({ err, mediaId }, "hls_proxy_unhandled_exception");
    return finishError({
      mediaId,
      userId,
      reason: "internal_error",
      artifactKind: "segment",
      objectKey: "",
    });
  }
}

async function runHlsDeliveryProxy(input: {
  mediaId: string;
  pathSegments: string[] | undefined;
  rangeHeader: string | null;
  userId: string;
}): Promise<Response> {
  const { mediaId, userId } = input;

  const normalized = normalizeHlsUrlPathSegments(input.pathSegments);
  if (!normalized.ok) {
    return finishError({
      mediaId,
      userId,
      reason: "forbidden_path",
      artifactKind: "segment",
      objectKey: "",
    });
  }

  const segments = normalized.segments;
  const artifactKind = inferHlsArtifactKind(segments);
  const objectKey = hlsArtifactObjectKey(mediaId, segments);

  if (!isTrustedHlsArtifactS3Key(mediaId, objectKey)) {
    return finishError({
      mediaId,
      userId,
      reason: "forbidden_path",
      artifactKind,
      objectKey,
    });
  }

  const row = await getMediaRowForPlayback(mediaId);
  if (!row) {
    return finishError({
      mediaId,
      userId,
      reason: "media_not_readable",
      artifactKind,
      objectKey,
    });
  }

  const trustedPrefixes = buildTrustedPrivateObjectUrlPrefixes();

  if (isHlsPlaylistPath(segments)) {
    const range = parseSingleBytesRangeHeader(input.rangeHeader);
    if (range.kind === "invalid") {
      return finishError({
        mediaId,
        userId,
        reason: "range_not_satisfiable",
        artifactKind,
        objectKey,
      });
    }

    const bufResult = await s3GetPrivateObjectBuffer(objectKey);
    if (!bufResult.ok) {
      const reason = mapS3FailureToReason(bufResult.reason, "playlist");
      return finishError({ mediaId, userId, reason, artifactKind, objectKey });
    }

    let text = bufResult.buf.toString("utf8");
    try {
      text = rewriteM3u8AbsoluteUrls(text, mediaId, trustedPrefixes);
    } catch {
      return finishError({
        mediaId,
        userId,
        reason: "playlist_rewrite_failed",
        artifactKind,
        objectKey,
      });
    }

    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "private, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  let awsRange: string | null = null;
  if (hlsArtifactSupportsHttpRange(segments)) {
    const parsed = parseSingleBytesRangeHeader(input.rangeHeader);
    if (parsed.kind === "invalid") {
      return finishError({
        mediaId,
        userId,
        reason: "range_not_satisfiable",
        artifactKind,
        objectKey,
      });
    }
    if (parsed.kind === "range") awsRange = parsed.awsHeader;
  } else if (input.rangeHeader?.trim()) {
    const parsed = parseSingleBytesRangeHeader(input.rangeHeader);
    if (parsed.kind === "invalid") {
      return finishError({
        mediaId,
        userId,
        reason: "range_not_satisfiable",
        artifactKind,
        objectKey,
      });
    }
  }

  const streamed = await s3GetObjectStream({ key: objectKey, range: awsRange });
  if (!streamed.ok) {
    const reason = mapS3FailureToReason(streamed.reason, "segment");
    return finishError({ mediaId, userId, reason, artifactKind, objectKey });
  }

  const ct = contentTypeForArtifact(segments, streamed.contentType);
  const headers = new Headers({
    "Content-Type": ct,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  if (streamed.contentLength != null && Number.isFinite(streamed.contentLength)) {
    headers.set("Content-Length", String(streamed.contentLength));
  }
  if (streamed.contentRange) headers.set("Content-Range", streamed.contentRange);
  if (streamed.eTag) headers.set("ETag", streamed.eTag);

  return new Response(streamed.stream, {
    status: streamed.httpStatus,
    headers,
  });
}
