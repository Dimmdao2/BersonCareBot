import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runWebappPgTextMock } = vi.hoisted(() => ({
  runWebappPgTextMock: vi.fn(() => Promise.resolve({ rows: [] })),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import { insertPlaybackResolutionEvent } from './pgPlaybackResolutionEvents';

describe('insertPlaybackResolutionEvent', () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runWebappPgTextMock.mockResolvedValue({ rows: [] });
  });

  it('invokes the narrow signed-context accessor', async () => {
    await insertPlaybackResolutionEvent({
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      mediaId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      delivery: 'hls',
      fallbackUsed: true,
    });

    expect(runWebappPgTextMock).toHaveBeenCalledWith(
      'SELECT app.record_media_playback_resolution_event($1::uuid, $2::uuid, $3, $4)',
      ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'hls', true],
    );
  });
});
