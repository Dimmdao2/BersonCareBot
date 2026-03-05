import { describe, expect, it, vi } from 'vitest';
import type { OutgoingIntent } from '../../kernel/contracts/index.js';
import { dispatchIntent } from './dispatcher.js';

describe('dispatchIntent', () => {
  it('sends intent via first matching adapter', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: {
        eventId: 'out-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'domain',
      },
      payload: { message: { text: 'hello' } },
    };

    await dispatchIntent(intent, [
      { canHandle: () => true, send },
    ]);

    expect(send).toHaveBeenCalledTimes(1);
  });
});
