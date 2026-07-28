import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runWebappPgTextMock, loggerErrorMock } = vi.hoisted(() => ({
  runWebappPgTextMock: vi.fn(() => Promise.resolve({ rows: [] })),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
}));

vi.mock('@/app-layer/logging/logger', () => ({
  logger: { error: loggerErrorMock },
}));

import { recordPlaybackResolutionStat, utcHourBucketIso } from './playbackStatsHourly';

describe('utcHourBucketIso', () => {
  it('floors to UTC hour', () => {
    const d = new Date('2026-05-03T14:35:22.123Z');
    expect(utcHourBucketIso(d)).toBe('2026-05-03T14:00:00.000Z');
  });
});

describe('recordPlaybackResolutionStat', () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runWebappPgTextMock.mockResolvedValue({ rows: [] });
    loggerErrorMock.mockReset();
  });

  it('increments through the narrow playback telemetry accessor', async () => {
    await recordPlaybackResolutionStat({
      userId: 'user-id',
      mediaId: 'media-id',
      delivery: 'mp4',
      fallbackUsed: true,
    });

    expect(runWebappPgTextMock).toHaveBeenCalledWith(
      'SELECT app.increment_media_playback_resolution_stat($1::uuid, $2::uuid, $3, $4)',
      ['user-id', 'media-id', 'mp4', true],
    );
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it('passes a false fallback marker unchanged', async () => {
    await recordPlaybackResolutionStat({
      userId: 'user-id',
      mediaId: 'media-id',
      delivery: 'hls',
      fallbackUsed: false,
    });
    expect(runWebappPgTextMock).toHaveBeenCalledWith(
      'SELECT app.increment_media_playback_resolution_stat($1::uuid, $2::uuid, $3, $4)',
      ['user-id', 'media-id', 'hls', false],
    );
  });

  it('calls the accessor for repeated playback resolutions', async () => {
    await recordPlaybackResolutionStat({
      userId: 'user-id',
      mediaId: 'media-id',
      delivery: 'file',
      fallbackUsed: false,
    });
    await recordPlaybackResolutionStat({
      userId: 'user-id',
      mediaId: 'media-id',
      delivery: 'file',
      fallbackUsed: false,
    });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
  });

  it('logs and does not throw when the accessor fails', async () => {
    runWebappPgTextMock.mockRejectedValueOnce(new Error('db_down'));
    await expect(
      recordPlaybackResolutionStat({
        userId: 'user-id',
        mediaId: 'media-id',
        delivery: 'mp4',
        fallbackUsed: false,
      }),
    ).resolves.toBeUndefined();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ delivery: 'mp4', err: expect.any(Error) }),
      'playback_stats_hourly_write_failed',
    );
  });
});
