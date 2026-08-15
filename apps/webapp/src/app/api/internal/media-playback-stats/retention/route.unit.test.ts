import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  purge: vi.fn(async () => {
    throw new Error('database denied');
  }),
  recordTick: vi.fn(async () => undefined),
}));

vi.mock('@/config/env', () => ({ env: { INTERNAL_JOB_SECRET: 'test-secret' } }));
vi.mock('@/app-layer/media/playbackHourlyRetention', () => ({
  PLAYBACK_HOURLY_STATS_RETENTION_DAYS: 90,
  purgeStalePlaybackHourlyStats: mocks.purge,
}));
vi.mock('@/app-layer/operator-health/recordOperatorCronJobTick', () => ({
  recordOperatorCronJobTickBestEffort: mocks.recordTick,
}));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@bersoncare/db-principal', async (importOriginal) => {
  const original = await importOriginal<typeof import('@bersoncare/db-principal')>();
  return { ...original, enterWithDbInfraPrincipal: vi.fn() };
});

import { POST } from './route';

describe('media playback retention route', () => {
  it('returns 500 instead of a false green response when the purge fails', async () => {
    const response = await POST(new Request(
      'http://localhost/api/internal/media-playback-stats/retention',
      { method: 'POST', headers: { Authorization: 'Bearer test-secret' } },
    ));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'retention_failed' });
    expect(mocks.purge).toHaveBeenCalledWith({
      dryRun: false,
      retentionDays: 90,
      throwErrors: true,
    });
    expect(mocks.recordTick).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
