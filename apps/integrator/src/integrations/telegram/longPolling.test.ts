import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
  vi.clearAllMocks();
});

describe('Telegram long polling retry cursor', () => {
  it('does not advance the offset when infrastructure processing rejects an update', async () => {
    vi.useFakeTimers();
    const getUpdates = vi
      .fn()
      .mockResolvedValueOnce([
        {
          update_id: 17,
          message: {
            message_id: 1,
            text: 'help',
            from: { id: 42 },
            chat: { id: 42, type: 'private' },
          },
        },
      ])
      .mockImplementationOnce(async (_payload, signal: AbortSignal | undefined) =>
        new Promise<never>((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted', 'AbortError')),
            { once: true },
          );
        }),
      );
    const processTelegramUpdate = vi.fn(async () => {
      throw new Error('resolver DB unavailable');
    });

    vi.doMock('./client.js', () => ({
      getBotInstance: vi.fn(async () => ({
        api: {
          getUpdates,
          deleteWebhook: vi.fn(async () => undefined),
        },
      })),
    }));
    vi.doMock('./webhook.js', () => ({ processTelegramUpdate }));
    vi.doMock('./setupMenuButton.js', () => ({
      setupTelegramMenuButton: vi.fn(async () => undefined),
    }));

    const { startTelegramLongPolling, stopTelegramLongPolling } = await import('./longPolling.js');
    startTelegramLongPolling({} as never);
    await vi.waitFor(() => expect(processTelegramUpdate).toHaveBeenCalledOnce());

    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() => expect(getUpdates).toHaveBeenCalledTimes(2));

    expect(getUpdates.mock.calls[1]?.[0]).not.toHaveProperty('offset');
    await stopTelegramLongPolling();
  });
});
