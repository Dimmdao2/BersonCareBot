import { beforeEach, describe, expect, it, vi } from 'vitest';

const { insertPlaybackResolutionEventMock, loggerErrorMock } = vi.hoisted(() => ({
  insertPlaybackResolutionEventMock: vi.fn(() => Promise.resolve()),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@/infra/repos/pgPlaybackResolutionEvents', () => ({
  insertPlaybackResolutionEvent: insertPlaybackResolutionEventMock,
}));

vi.mock('@/app-layer/logging/logger', () => ({
  logger: { error: loggerErrorMock },
}));

import { recordPlaybackResolutionEvent } from './playbackResolutionEvents';

const uid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const mid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('recordPlaybackResolutionEvent', () => {
  beforeEach(() => {
    insertPlaybackResolutionEventMock.mockReset();
    loggerErrorMock.mockReset();
    insertPlaybackResolutionEventMock.mockResolvedValue(undefined);
  });

  it('skips invalid ids', async () => {
    await recordPlaybackResolutionEvent({
      userId: 'tg:x',
      mediaId: mid,
      delivery: 'mp4',
      fallbackUsed: false,
    });
    expect(insertPlaybackResolutionEventMock).not.toHaveBeenCalled();
  });

  it('records valid ids through the narrow playback telemetry accessor', async () => {
    await recordPlaybackResolutionEvent({
      userId: uid,
      mediaId: mid,
      delivery: 'hls',
      fallbackUsed: true,
    });
    expect(insertPlaybackResolutionEventMock).toHaveBeenCalledWith({
      userId: uid,
      mediaId: mid,
      delivery: 'hls',
      fallbackUsed: true,
    });
  });

  it('logs and swallows accessor errors', async () => {
    const err = new Error('db_down');
    insertPlaybackResolutionEventMock.mockRejectedValue(err);
    await expect(
      recordPlaybackResolutionEvent({
        userId: uid,
        mediaId: mid,
        delivery: 'file',
        fallbackUsed: false,
      }),
    ).resolves.toBeUndefined();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err, mediaId: mid }),
      'playback_resolution_event_write_failed',
    );
  });
});
