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

/**
 * One row binds 7 params (`bucketDate`, `organizationId`, `userId`, `mediaId`, `quality`,
 * `requestCount`, `bytesTotal`). PostgreSQL's extended query protocol caps bound parameters per
 * statement at 65535 (an `int16` count) — 9363 rows already exceeds it (65541), and the audit found
 * `drizzle` itself throwing a `RangeError` well before that, around ~20000 rows. 2000 rows/chunk
 * (14000 params) sits comfortably under both ceilings while keeping round-trips low (10 chunks for
 * the 20000-row regression test below).
 */
const FLUSH_CHUNK_SIZE = 2000;

function chunkRows<T>(rows: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}

/**
 * `true` only when the server itself rejected the statement (a `SQLSTATE`-bearing error response),
 * which for a single-statement implicit transaction means it was rolled back — safe to retry with
 * the exact same rows next tick. A network-level failure (dropped connection, timeout, pool
 * exhaustion) carries no `SQLSTATE`: the statement may already have committed server-side and only
 * the acknowledgement was lost in transit, so it is NOT safe to assume "not committed" for those.
 */
function isDefinitelyNotCommittedError(e: unknown): boolean {
  const code = (e as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code);
}

async function upsertHlsDeliveryByteMeterChunk(
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
 * The batch is written in `FLUSH_CHUNK_SIZE`-row chunks (bind-parameter limit, see above), each
 * chunk attempted independently so one bad chunk cannot sink the rest of an otherwise-healthy batch.
 *
 * Requeue is narrowed to chunks whose write is *known* not to have committed
 * (`isDefinitelyNotCommittedError`) — audit finding: the previous "requeue on any error" was an
 * unconditional additive upsert, so a connection drop *after* the server committed would silently add
 * the same bytes again on the next tick, with no way to detect it later (the table has no history of
 * individual flush attempts, only running totals). A chunk that fails with an ambiguous
 * (commit-unknown) error is logged and dropped instead of requeued.
 *
 * Why drop instead of building a dedup ledger: an idempotency key would need its own table plus a
 * migration and a rework of the requeue path (which currently merges failed rows back into rows
 * accumulated after the failure, at the per-key level — a retried "attempt" is never actually the
 * same attempt again), for a failure window that only exists between the server committing a chunk
 * and this process receiving the acknowledgement — milliseconds, on a tick that already runs every 5
 * minutes. Cost of getting the choice wrong either way is bounded: a dropped chunk undercounts by at
 * most one tick's worth of bytes for the affected keys and is invisible only until the next flush
 * partially corrects it (same keys keep accumulating), while a wrongly requeued chunk would double
 * the byte count *permanently and undetectably* (the additive upsert has no way to notice or reverse
 * it). Given the table backs cost accounting, silent overcounting is the worse failure mode, so this
 * flush accepts a rare bounded undercount over a rare unbounded overcount.
 *
 * `throwErrors` (used by the job route so operator health sees an honest failed tick instead of a
 * false-green "flushed N rows") rethrows once any chunk failed; the default keeps this safe to call
 * from anywhere else without risking an unhandled rejection.
 */
export async function flushHlsDeliveryByteMeterBestEffort(options?: {
  throwErrors?: boolean;
}): Promise<HlsDeliveryByteMeterFlushResult> {
  const rows = snapshotAndClearHlsDeliveryByteMeter();
  if (rows.length === 0) return { rowsFlushed: 0, requestsFlushed: 0, bytesFlushed: 0 };

  const chunks = chunkRows(rows, FLUSH_CHUNK_SIZE);
  const committed: HlsDeliveryByteMeterRow[] = [];
  const toRequeue: HlsDeliveryByteMeterRow[] = [];
  const failures: unknown[] = [];

  for (const chunk of chunks) {
    try {
      await upsertHlsDeliveryByteMeterChunk(chunk);
      committed.push(...chunk);
    } catch (e) {
      failures.push(e);
      if (isDefinitelyNotCommittedError(e)) {
        toRequeue.push(...chunk);
      } else {
        logger.error(
          {
            err: e,
            rows: chunk.length,
            bytesDropped: chunk.reduce((sum, row) => sum + row.bytesTotal, 0),
          },
          'hls_delivery_byte_meter_flush_chunk_commit_unknown_dropped',
        );
      }
    }
  }

  if (toRequeue.length > 0) {
    logger.error({ rows: toRequeue.length }, 'hls_delivery_byte_meter_flush_failed');
    requeueHlsDeliveryByteMeterRows(toRequeue);
  }

  const result: HlsDeliveryByteMeterFlushResult = {
    rowsFlushed: committed.length,
    requestsFlushed: committed.reduce((sum, row) => sum + row.requestCount, 0),
    bytesFlushed: committed.reduce((sum, row) => sum + row.bytesTotal, 0),
  };

  if (failures.length > 0 && options?.throwErrors) {
    // Single-chunk batches (the common case — most ticks fit in one chunk) rethrow the original
    // error as-is, unwrapped, so callers matching on its message/type keep working.
    if (failures.length === 1) throw failures[0];
    throw new AggregateError(
      failures,
      `hls delivery byte meter flush: ${failures.length}/${chunks.length} chunk(s) failed`,
    );
  }

  return result;
}
