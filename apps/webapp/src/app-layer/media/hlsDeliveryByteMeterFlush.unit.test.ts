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
} from './hlsDeliveryByteMeter';
import { flushHlsDeliveryByteMeterBestEffort } from './hlsDeliveryByteMeterFlush';

const ORG = 'org-1';
const USER = 'user-1';
const MEDIA = 'media-1';
const DAY = new Date('2026-09-11T12:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  snapshotAndClearHlsDeliveryByteMeter();
  fakes.db.insert.mockReturnValue({
    values: vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn() }),
  });
});

/**
 * WHAT BREAKS: the maintenance job flushes the in-memory batch every 5 minutes; the owner's design
 * constraint is that a write failure at this stage "не имеет права ни замедлить выдачу, ни её
 * сорвать" — the HLS proxy must keep serving bytes even if the DB write fails.
 * CONSEQUENCE: without a requeue-and-swallow path, a transient DB error during flush would either
 * throw into whatever called it unattended (crashing the cron tick with no delivery impact excuse
 * left) or silently drop that batch's bytes forever.
 * ORACLE: `flushHlsDeliveryByteMeterBestEffort`'s own contract — snapshot, try to write, and on
 * failure requeue the same rows back into the live buffer instead of losing them.
 */
describe('flushHlsDeliveryByteMeterBestEffort write-failure handling', () => {
  it('requeues the batch and does not throw by default when the DB write fails', async () => {
    fakes.db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockRejectedValue(new Error('connection reset')),
      }),
    });
    recordHlsDeliveryBytes({ organizationId: ORG, userId: USER, mediaId: MEDIA, quality: '576p', bytes: 500, now: DAY });

    const result = await flushHlsDeliveryByteMeterBestEffort();

    expect(result).toEqual({ rowsFlushed: 0, requestsFlushed: 0, bytesFlushed: 0 });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), rows: 1 }),
      'hls_delivery_byte_meter_flush_failed',
    );
    // The failed row is back in the buffer for the next tick, not lost.
    expect(hlsDeliveryByteMeterSizeForTest()).toBe(1);
    const rows = snapshotAndClearHlsDeliveryByteMeter();
    expect(rows).toEqual([
      { bucketDate: '2026-09-11', organizationId: ORG, userId: USER, mediaId: MEDIA, quality: '576p', requestCount: 1, bytesTotal: 500 },
    ]);
  });

  it('rethrows only when explicitly asked to (job route needs an honest failed tick)', async () => {
    fakes.db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockRejectedValue(new Error('connection reset')),
      }),
    });
    recordHlsDeliveryBytes({ organizationId: ORG, userId: USER, mediaId: MEDIA, quality: '576p', bytes: 500, now: DAY });

    await expect(flushHlsDeliveryByteMeterBestEffort({ throwErrors: true })).rejects.toThrow('connection reset');
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
