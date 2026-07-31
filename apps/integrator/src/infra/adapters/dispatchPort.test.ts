import { describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/devDeliveryRedirect.js', () => ({
  isDevRedirectActive: () => false,
}));

import { createDefaultDispatchPort } from './dispatchPort.js';
import type { DbWritePort, DeliveryAdapter, OutgoingIntent } from '../../kernel/contracts/index.js';

function messageSendIntent(): OutgoingIntent {
  return {
    type: 'message.send',
    meta: {
      eventId: 'evt-1',
      occurredAt: new Date().toISOString(),
      source: 'telegram',
      outboundMessageClass: 'operator_security',
      outboundCapability: 'operator_alert',
    },
    payload: {
      recipient: { chatId: 123 },
      message: { text: 'hello' },
      delivery: { channels: ['telegram'] },
    },
  } as unknown as OutgoingIntent;
}

describe('D20 item 17: a failed delivery-attempt audit write must not cause a duplicate send', () => {
  it('returns the real send result even when the audit write throws (send is not retried, outcome is not swallowed)', async () => {
    const send = vi.fn(async () => ({ telegramMessageId: 42 }));
    const adapter: DeliveryAdapter = { canHandle: () => true, send };
    const writePort: DbWritePort = {
      writeDb: vi.fn(async () => {
        throw new Error('audit_write_failed');
      }),
    };
    const port = createDefaultDispatchPort({ adapters: [adapter], writePort });

    const result = await port.dispatchOutgoing(messageSendIntent());

    expect(result).toEqual({ telegramMessageId: 42 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rejects with the original provider error (not the audit error) when both the send and its audit write fail, and calls the adapter exactly once', async () => {
    const providerError = new Error('provider_rejected');
    const send = vi.fn(async () => {
      throw providerError;
    });
    const adapter: DeliveryAdapter = { canHandle: () => true, send };
    const writePort: DbWritePort = {
      writeDb: vi.fn(async () => {
        throw new Error('audit_write_failed');
      }),
    };
    const port = createDefaultDispatchPort({ adapters: [adapter], writePort });

    await expect(port.dispatchOutgoing(messageSendIntent())).rejects.toBe(providerError);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
