import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app-layer/logging/logger', () => ({
  logger: { error: vi.fn() },
}));

import { logger } from '@/app-layer/logging/logger';
import {
  hlsDeliveryByteMeterSizeForTest,
  recordHlsDeliveryBytes,
  snapshotAndClearHlsDeliveryByteMeter,
} from './hlsDeliveryByteMeter';

const ORG = 'org-1';
const USER = 'user-1';
const MEDIA = 'media-1';
const DAY = new Date('2026-09-11T12:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  // Drain whatever the previous test left in the module-scope buffer.
  snapshotAndClearHlsDeliveryByteMeter();
});

/**
 * WHAT BREAKS: dozens of segments are delivered per view; the owner's explicit design constraint
 * is one row per (day, org, user, media, quality) with SUMMED requests/bytes, not one row per
 * segment.
 * CONSEQUENCE: without folding, a single view of a 30-segment rendition would write 30 rows (or,
 * worse, 30 competing `INSERT`s per flush) instead of incrementing one daily counter, defeating both
 * the storage budget and the "requests this day" figure the owner asked for.
 * ORACLE: the unique key is (bucket_date, organization_id, user_id, media_id, quality) — repeated
 * calls with the same key must collapse into exactly one buffered row before the flush ever runs.
 */
describe('recordHlsDeliveryBytes aggregation', () => {
  it('folds repeated segment deliveries for the same key into one row per day', () => {
    recordHlsDeliveryBytes({ organizationId: ORG, userId: USER, mediaId: MEDIA, quality: '576p', bytes: 100, now: DAY });
    recordHlsDeliveryBytes({ organizationId: ORG, userId: USER, mediaId: MEDIA, quality: '576p', bytes: 250, now: DAY });
    recordHlsDeliveryBytes({ organizationId: ORG, userId: USER, mediaId: MEDIA, quality: '576p', bytes: 50, now: DAY });

    expect(hlsDeliveryByteMeterSizeForTest()).toBe(1);
    const rows = snapshotAndClearHlsDeliveryByteMeter();
    expect(rows).toEqual([
      {
        bucketDate: '2026-09-11', organizationId: ORG, userId: USER, mediaId: MEDIA, quality: '576p',
        requestCount: 3, bytesTotal: 400,
      },
    ]);
  });

  it('keeps per-video and per-quality breakdown separate — required keys, not an option', () => {
    recordHlsDeliveryBytes({ organizationId: ORG, userId: USER, mediaId: MEDIA, quality: '576p', bytes: 100, now: DAY });
    recordHlsDeliveryBytes({ organizationId: ORG, userId: USER, mediaId: MEDIA, quality: '720p', bytes: 100, now: DAY });
    recordHlsDeliveryBytes({ organizationId: ORG, userId: USER, mediaId: 'media-2', quality: '576p', bytes: 100, now: DAY });

    expect(hlsDeliveryByteMeterSizeForTest()).toBe(3);
  });

  it('drops a row with no resolvable organization rather than writing it under a NULL key', () => {
    recordHlsDeliveryBytes({ organizationId: null, userId: USER, mediaId: MEDIA, quality: '576p', bytes: 100, now: DAY });
    recordHlsDeliveryBytes({ organizationId: undefined, userId: USER, mediaId: MEDIA, quality: '576p', bytes: 100, now: DAY });

    expect(hlsDeliveryByteMeterSizeForTest()).toBe(0);
  });

  /**
   * WHAT BREAKS: `recordHlsDeliveryBytes` runs inline on the HLS proxy's response path (owner:
   * "отказ записи не имеет права ни замедлить выдачу, ни её сорвать").
   * CONSEQUENCE: a bug in the counter (bad `Date`, corrupt input) throwing synchronously would
   * propagate into the caller and turn a successful segment delivery into a 5xx.
   * ORACLE: the function's own contract — it must swallow and log, never throw, regardless of what
   * breaks internally.
   */
  it('never throws even when it fails internally, so a counting bug cannot break delivery', () => {
    const brokenNow = { toISOString: () => { throw new Error('clock exploded'); } } as unknown as Date;

    expect(() =>
      recordHlsDeliveryBytes({
        organizationId: ORG, userId: USER, mediaId: MEDIA, quality: '576p', bytes: 100, now: brokenNow,
      }),
    ).not.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'hls_delivery_byte_meter_record_failed',
    );
    // The broken call recorded nothing — but it also cost the delivery response nothing.
    expect(hlsDeliveryByteMeterSizeForTest()).toBe(0);
  });
});
