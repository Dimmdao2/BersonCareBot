import { beforeEach, expect, it, vi } from 'vitest';

const getDrizzleMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: getDrizzleMock,
}));

vi.mock('@/app-layer/logging/logger', () => ({
  logger: { error: vi.fn() },
}));

import {
  mediaPlaybackClientEvents,
  mediaPlaybackResolutionEvents,
  mediaPlaybackStatsHourly,
  mediaPlaybackUserVideoFirstResolve,
} from '../../../db/schema';
import { purgeStalePlaybackHourlyStats } from './playbackHourlyRetention';

beforeEach(() => {
  vi.clearAllMocks();
});

it('prunes all three bounded playback stores and never the lifetime first-resolve ledger', async () => {
  const deleteMock = vi.fn((table: unknown) => ({
    where: vi.fn(() => ({
      returning: vi.fn(async () => {
        if (table === mediaPlaybackStatsHourly) return [{ bucketHour: new Date() }];
        if (table === mediaPlaybackResolutionEvents) return [{ id: 'r1' }, { id: 'r2' }];
        if (table === mediaPlaybackClientEvents) return [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
        return [];
      }),
    })),
  }));
  const transaction = vi.fn(
    async (callback: (tx: { delete: typeof deleteMock }) => Promise<unknown>) =>
      callback({ delete: deleteMock }),
  );
  getDrizzleMock.mockReturnValue({ transaction });

  await expect(purgeStalePlaybackHourlyStats({ throwErrors: true })).resolves.toEqual({
    deleted: 6,
    deletedByStore: { hourly: 1, resolutionEvents: 2, clientEvents: 3 },
    retentionDays: 90,
    rawEventRetentionDays: 400,
    dryRun: false,
  });

  expect(deleteMock.mock.calls.map(([table]) => table)).toEqual([
    mediaPlaybackStatsHourly,
    mediaPlaybackResolutionEvents,
    mediaPlaybackClientEvents,
  ]);
  expect(deleteMock.mock.calls.some(([table]) => table === mediaPlaybackUserVideoFirstResolve)).toBe(false);
});
