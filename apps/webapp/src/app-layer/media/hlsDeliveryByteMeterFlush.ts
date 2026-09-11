import { sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { logger } from '@/app-layer/logging/logger';
import { mediaPlaybackDeliveryDaily } from '../../../db/schema';
import {
  requeueHlsDeliveryByteMeterRows,
  snapshotAndClearHlsDeliveryByteMeter,
  type HlsDeliveryByteMeterRow,
} from '@/app-layer/media/hlsDeliveryByteMeter';

export type HlsDeliveryByteMeterFlushResult = {
  rowsFlushed: number;
  requestsFlushed: number;
  bytesFlushed: number;
};

async function upsertHlsDeliveryByteMeterBatch(
  rows: readonly HlsDeliveryByteMeterRow[],
): Promise<void> {
  const db = getDrizzle();
  await db
    .insert(mediaPlaybackDeliveryDaily)
    .values(
      rows.map((row) => ({
        bucketDate: row.bucketDate,
        organizationId: row.organizationId,
        userId: row.userId,
        mediaId: row.mediaId,
        quality: row.quality,
        requestCount: row.requestCount,
        bytesTotal: row.bytesTotal,
      })),
    )
    .onConflictDoUpdate({
      target: [
        mediaPlaybackDeliveryDaily.bucketDate,
        mediaPlaybackDeliveryDaily.organizationId,
        mediaPlaybackDeliveryDaily.userId,
        mediaPlaybackDeliveryDaily.mediaId,
        mediaPlaybackDeliveryDaily.quality,
      ],
      set: {
        requestCount: sql`${mediaPlaybackDeliveryDaily.requestCount} + excluded.request_count`,
        bytesTotal: sql`${mediaPlaybackDeliveryDaily.bytesTotal} + excluded.bytes_total`,
      },
    });
}

/**
 * Drains the in-memory HLS delivery byte batch (`hlsDeliveryByteMeter.ts`) into
 * `media_playback_delivery_daily`. Called only from the internal maintenance job route — never from
 * a request handling an actual segment (VIDEO_DELIVERY_COST_AND_METERING design constraint: no
 * `INSERT`/`UPDATE` on the delivery path).
 *
 * A failed write re-queues the snapshot into the live buffer (merged additively with whatever
 * accumulated meanwhile) rather than dropping it: a transient DB error delays a day's byte count for
 * the next tick instead of losing it silently.
 *
 * `throwErrors` (used by the job route so operator health sees an honest failed tick instead of a
 * false-green "flushed 0 rows") rethrows after the requeue; the default keeps this safe to call from
 * anywhere else without risking an unhandled rejection.
 */
export async function flushHlsDeliveryByteMeterBestEffort(options?: {
  throwErrors?: boolean;
}): Promise<HlsDeliveryByteMeterFlushResult> {
  const rows = snapshotAndClearHlsDeliveryByteMeter();
  if (rows.length === 0) return { rowsFlushed: 0, requestsFlushed: 0, bytesFlushed: 0 };
  try {
    await upsertHlsDeliveryByteMeterBatch(rows);
    return {
      rowsFlushed: rows.length,
      requestsFlushed: rows.reduce((sum, row) => sum + row.requestCount, 0),
      bytesFlushed: rows.reduce((sum, row) => sum + row.bytesTotal, 0),
    };
  } catch (e) {
    logger.error({ err: e, rows: rows.length }, 'hls_delivery_byte_meter_flush_failed');
    requeueHlsDeliveryByteMeterRows(rows);
    if (options?.throwErrors) throw e;
    return { rowsFlushed: 0, requestsFlushed: 0, bytesFlushed: 0 };
  }
}
