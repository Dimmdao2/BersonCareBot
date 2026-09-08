import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MediaPlaybackPayload } from '@/modules/media/playbackPayloadTypes';
import {
  useDiscussionMessageMediaPlayback,
  type DiscussionMessageMediaPlayback,
} from './useDiscussionMessageMediaPlayback';

const firstMediaId = '11111111-1111-4111-8111-111111111111';
const secondMediaId = '22222222-2222-4222-8222-222222222222';

function playback(mediaId: string, status: MediaPlaybackPayload['preview']['status']): MediaPlaybackPayload {
  return {
    mediaId,
    delivery: 'file',
    mimeType: 'image/png',
    durationSeconds: null,
    posterUrl: null,
    preview: { status, smUrl: null, mdUrl: null, standardRendition: false },
    hls: null,
    progressive: { url: `/api/media/${mediaId}` },
    expiresInSeconds: 900,
  };
}

function Probe({
  mediaId,
  observe,
}: {
  mediaId: string | null;
  observe: (value: DiscussionMessageMediaPlayback) => void;
}) {
  observe(useDiscussionMessageMediaPlayback(mediaId));
  return null;
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('discussion-media preview polling', () => {
  it('refreshes a pending preview until the playback route reports a terminal result', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => playback(firstMediaId, 'pending') })
      .mockResolvedValueOnce({ ok: true, json: async () => playback(firstMediaId, 'ready') });
    vi.stubGlobal('fetch', fetch);
    let result: DiscussionMessageMediaPlayback | null = null;

    render(<Probe mediaId={firstMediaId} observe={(value) => (result = value)} />);
    await settle();
    expect(result?.playback?.preview.status).toBe('pending');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result?.playback?.preview.status).toBe('ready');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('cancels pending polling when its media changes or the consumer unmounts', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => playback(firstMediaId, 'pending') })
      .mockResolvedValueOnce({ ok: true, json: async () => playback(secondMediaId, 'ready') });
    vi.stubGlobal('fetch', fetch);
    const view = render(<Probe mediaId={firstMediaId} observe={() => undefined} />);
    await settle();

    view.rerender(<Probe mediaId={secondMediaId} observe={() => undefined} />);
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    expect(fetch).toHaveBeenCalledTimes(2);

    view.rerender(<Probe mediaId={firstMediaId} observe={() => undefined} />);
    await settle();
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
