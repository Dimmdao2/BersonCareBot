import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  insertChain: {
    values: vi.fn(),
  },
  db: { insert: vi.fn() },
}));

vi.mock('@/app-layer/logging/logger', () => ({
  logger: { error: vi.fn() },
}));
vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: () => fakes.db,
}));

import { logger } from '@/app-layer/logging/logger';
import {
  hlsDeliveryByteMeterSizeForTest,
  recordHlsDeliveryBytes,
  snapshotAndClearHlsDeliveryByteMeter,
  type HlsDeliveryByteMeterRow,
} from './hlsDeliveryByteMeter';
import { flushHlsDeliveryByteMeterBestEffort } from './hlsDeliveryByteMeterFlush';

const ORG = 'org-1';
const USER = 'user-1';
const MEDIA = 'media-1';
const DAY = new Date('2026-09-11T12:00:00.000Z');

/** Postgres SQLSTATE-bearing error — the server processed and rejected the statement. */
function pgError(code: string, message = 'db rejected the statement'): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

beforeEach(() => {
  vi.clearAllMocks();
  snapshotAndClearHlsDeliveryByteMeter();
  fakes.db.insert.mockReturnValue({
    values: vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn() }),
  });
});

function mockInsertOnce(impl: () => Promise<void>): void {
  fakes.db.insert.mockReturnValueOnce({
    values: vi.fn().mockReturnValue({ onConflictDoUpdate: impl }),
  });
}

/**
 * WHAT BREAKS: the maintenance job flushes the in-memory batch every 5 minutes; the owner's design
 * constraint is that a write failure at this stage "не имеет права ни замедлить выдачу, ни её
 * сорвать" — the HLS proxy must keep serving bytes even if the DB write fails.
 * CONSEQUENCE: without a requeue path for definitively-not-committed writes, a rejected statement
 * (constraint violation, bad value, etc.) would silently drop that batch's bytes forever instead of
 * retrying.
 * ORACLE: `flushHlsDeliveryByteMeterBestEffort`'s contract — a write the server actively rejected
 * (a SQLSTATE-bearing error, meaning its implicit transaction rolled back) is safe to requeue and
 * retry with the exact same rows next tick.
 */
describe('flushHlsDeliveryByteMeterBestEffort — server-rejected writes (safe to requeue)', () => {
  it('requeues the batch and does not throw by default when the server rejects the statement', async () => {
    mockInsertOnce(() => Promise.reject(pgError('23505', 'duplicate key')));
    recordHlsDeliveryBytes({ organizationId: ORG, userId: USER, mediaId: MEDIA, quality: '576p', bytes: 500, now: DAY });

    const result = await flushHlsDeliveryByteMeterBestEffort();

    expect(result).toEqual({ rowsFlushed: 0, requestsFlushed: 0, bytesFlushed: 0 });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ rows: 1 }),
      'hls_delivery_byte_meter_flush_failed',
    );
    // The rejected row is back in the buffer for the next tick, not lost.
    expect(hlsDeliveryByteMeterSizeForTest()).toBe(1);
    const rows = snapshotAndClearHlsDeliveryByteMeter();
    expect(rows).toEqual([
      { bucketDate: '2026-09-11', organizationId: ORG, userId: USER, mediaId: MEDIA, quality: '576p', requestCount: 1, bytesTotal: 500 },
    ]);
  });

  it('rethrows the original error only when explicitly asked to (job route needs an honest failed tick)', async () => {
    const err = pgError('23505', 'duplicate key');
    mockInsertOnce(() => Promise.reject(err));
    recordHlsDeliveryBytes({ organizationId: ORG, userId: USER, mediaId: MEDIA, quality: '576p', bytes: 500, now: DAY });

    await expect(flushHlsDeliveryByteMeterBestEffort({ throwErrors: true })).rejects.toBe(err);
    // Still requeued even on the throwing path — the caller's error handling, not data loss.
    expect(hlsDeliveryByteMeterSizeForTest()).toBe(1);
  });

  it('flushes and sums a successful batch, clearing the buffer', async () => {
    recordHlsDeliveryBytes({ organizationId: ORG, userId: USER, mediaId: MEDIA, quality: '576p', bytes: 500, now: DAY });
    recordHlsDeliveryBytes({ organizationId: ORG, userId: USER, mediaId: MEDIA, quality: '720p', bytes: 300, now: DAY });

    const result = await flushHlsDeliveryByteMeterBestEffort();

    expect(result).toEqual({ rowsFlushed: 2, requestsFlushed: 2, bytesFlushed: 800 });
    expect(hlsDeliveryByteMeterSizeForTest()).toBe(0);
  });
});

/**
 * WHAT BREAKS: the write is an additive upsert (`bytes_total = bytes_total + excluded.bytes_total`).
 * CONSEQUENCE: requeueing a chunk whose commit outcome is unknown (connection dropped after the
 * server committed but before the ack reached this process) would add the same bytes a second time
 * on the next tick — permanently and undetectably, since the table only stores running totals, not a
 * log of individual flush attempts.
 * ORACLE: audit finding (`docs/audit/video-delivery-byte-metering-2026-09-11.md`, requirement 1,
 * "Двойной счёт") — a network-level failure (no SQLSTATE) must be dropped, not requeued.
 */
describe('flushHlsDeliveryByteMeterBestEffort — commit-unknown writes (must NOT requeue)', () => {
  it('drops (does not requeue) a chunk that fails with a plain connection error', async () => {
    mockInsertOnce(() => Promise.reject(new Error('connection reset')));
    recordHlsDeliveryBytes({ organizationId: ORG, userId: USER, mediaId: MEDIA, quality: '576p', bytes: 500, now: DAY });

    const result = await flushHlsDeliveryByteMeterBestEffort();

    expect(result).toEqual({ rowsFlushed: 0, requestsFlushed: 0, bytesFlushed: 0 });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), rows: 1, bytesDropped: 500 }),
      'hls_delivery_byte_meter_flush_chunk_commit_unknown_dropped',
    );
    // NOT back in the buffer — requeueing here would risk double-counting an already-committed write.
    expect(hlsDeliveryByteMeterSizeForTest()).toBe(0);
  });

  it('still rethrows when asked to, even though nothing was requeued', async () => {
    const err = new Error('connection reset');
    mockInsertOnce(() => Promise.reject(err));
    recordHlsDeliveryBytes({ organizationId: ORG, userId: USER, mediaId: MEDIA, quality: '576p', bytes: 500, now: DAY });

    await expect(flushHlsDeliveryByteMeterBestEffort({ throwErrors: true })).rejects.toBe(err);
    expect(hlsDeliveryByteMeterSizeForTest()).toBe(0);
  });
});

/**
 * WHAT BREAKS: `upsertHlsDeliveryByteMeterChunk` binds 7 params/row in one `INSERT`.
 * CONSEQUENCE: PostgreSQL's bind-parameter ceiling is 65535 (int16 count) — 9363 rows already blows
 * past it (65541 params), and an unbatched flush that grows past a day's traffic never recovers once
 * it does (the old code returned the WHOLE batch to the buffer on failure, so the very next tick hits
 * the same ceiling again, forever).
 * ORACLE: audit finding, requirement 1, "Потолок 9362 строк" — the batch must be written in chunks
 * safely under the limit, and 20000 distinct keys must flush to completion in one call.
 */
describe('flushHlsDeliveryByteMeterBestEffort — chunking under the bind-parameter limit', () => {
  it('flushes 20000 distinct keys across multiple chunked INSERTs', async () => {
    const insertedChunkSizes: number[] = [];
    fakes.db.insert.mockImplementation(() => ({
      values: (rows: unknown[]) => {
        insertedChunkSizes.push(rows.length);
        return { onConflictDoUpdate: () => Promise.resolve() };
      },
    }));

    const KEY_COUNT = 20_000;
    for (let i = 0; i < KEY_COUNT; i += 1) {
      recordHlsDeliveryBytes({
        organizationId: ORG,
        userId: USER,
        mediaId: `media-${i}`,
        quality: '576p',
        bytes: 100,
        now: DAY,
      });
    }
    expect(hlsDeliveryByteMeterSizeForTest()).toBe(KEY_COUNT);

    const result = await flushHlsDeliveryByteMeterBestEffort({ throwErrors: true });

    expect(result).toEqual({
      rowsFlushed: KEY_COUNT,
      requestsFlushed: KEY_COUNT,
      bytesFlushed: KEY_COUNT * 100,
    });
    expect(hlsDeliveryByteMeterSizeForTest()).toBe(0);
    // More than one round-trip, and every chunk comfortably under Postgres' 65535-bind-param ceiling
    // (7 params/row ⇒ ≤9362 rows/chunk).
    expect(insertedChunkSizes.length).toBeGreaterThan(1);
    for (const size of insertedChunkSizes) expect(size).toBeLessThanOrEqual(9362);
    expect(insertedChunkSizes.reduce((sum, n) => sum + n, 0)).toBe(KEY_COUNT);
  });

  it('requeues only the chunk that was actually rejected, keeping the rest committed', async () => {
    const chunkCalls: HlsDeliveryByteMeterRow[][] = [];
    let call = 0;
    fakes.db.insert.mockImplementation(() => ({
      values: (rows: HlsDeliveryByteMeterRow[]) => {
        call += 1;
        chunkCalls.push(rows);
        const thisCall = call;
        return {
          onConflictDoUpdate: () =>
            thisCall === 2 ? Promise.reject(pgError('23505')) : Promise.resolve(),
        };
      },
    }));

    // Force multiple chunks with a tiny key set by recording distinct media ids beyond one chunk is
    // impractical here, so this test drives the chunk boundary directly by recording exactly enough
    // keys to produce 3 chunks at the real FLUSH_CHUNK_SIZE (2000/chunk ⇒ 4001 keys ⇒ 3 chunks).
    const KEY_COUNT = 4001;
    for (let i = 0; i < KEY_COUNT; i += 1) {
      recordHlsDeliveryBytes({
        organizationId: ORG,
        userId: USER,
        mediaId: `media-${i}`,
        quality: '576p',
        bytes: 10,
        now: DAY,
      });
    }

    const result = await flushHlsDeliveryByteMeterBestEffort();

    expect(chunkCalls).toHaveLength(3);
    const rejectedChunkSize = chunkCalls[1]!.length;
    expect(result.rowsFlushed).toBe(KEY_COUNT - rejectedChunkSize);
    // Only the rejected chunk's rows are back in the buffer.
    expect(hlsDeliveryByteMeterSizeForTest()).toBe(rejectedChunkSize);
  });
});
