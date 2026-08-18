import { getDrizzle } from '@/app-layer/db/drizzle';
import { logger } from '@/app-layer/logging/logger';
import { clampRetentionDays, pruneRetentionTarget } from '@/infra/db/pruneRetentionTarget';
import { mediaHlsProxyErrorEvents } from '../../../db/schema';
import {
  type HlsProxyArtifactKind,
  type HlsProxyReasonCodeDb,
} from '@/modules/media/hlsProxyTelemetry';

export const MEDIA_HLS_PROXY_ERROR_RETENTION_DAYS_DEFAULT = 90;

function trimObjectSuffix(key: string): string | null {
  const t = key.trim();
  if (!t) return null;
  return t.length > 128 ? t.slice(-128) : t;
}

const NO_PERSIST_REASONS = new Set<HlsProxyReasonCodeDb>([
  'session_unauthorized',
  'feature_disabled',
]);

export function shouldRecordMediaHlsProxyError(reason: HlsProxyReasonCodeDb): boolean {
  return !NO_PERSIST_REASONS.has(reason);
}

export async function recordMediaHlsProxyErrorEventIfNeeded(input: {
  mediaId: string;
  userId: string;
  reasonCode: HlsProxyReasonCodeDb;
  httpStatus: number;
  artifactKind: HlsProxyArtifactKind;
  objectSuffix: string;
}): Promise<void> {
  if (!shouldRecordMediaHlsProxyError(input.reasonCode)) return;
  try {
    const db = getDrizzle();
    await db.insert(mediaHlsProxyErrorEvents).values({
      mediaId: input.mediaId,
      userId: input.userId,
      reasonCode: input.reasonCode,
      httpStatus: input.httpStatus,
      artifactKind: input.artifactKind,
      objectSuffix: trimObjectSuffix(input.objectSuffix),
    });
  } catch (e) {
    logger.error(
      {
        err: e,
        mediaId: input.mediaId,
        userId: input.userId,
        reasonCode: input.reasonCode,
      },
      'media_hls_proxy_error_event_write_failed',
    );
  }
}

/**
 * The table sits under a locked tenant descriptor: a relation DELETE from the maintenance role can
 * never pass its wall, because a sweep across all clinics has no organization. It goes through the
 * one declared retention root instead — see `pruneRetentionTarget`.
 */
export async function purgeStaleMediaHlsProxyErrorEvents(input: {
  retentionDays: number;
  dryRun: boolean;
}): Promise<{ deleted: number; dryRun: boolean; retentionDays: number }> {
  const days = clampRetentionDays(input.retentionDays);
  const deleted = await pruneRetentionTarget('media_hls_proxy_error_events', days, {
    dryRun: input.dryRun,
  });
  return { deleted, dryRun: input.dryRun, retentionDays: days };
}
