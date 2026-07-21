import { describe, expect, it, vi } from 'vitest';
import type { OutgoingIntent } from '../../kernel/contracts/index.js';
import { createSmscDeliveryAdapter } from './deliveryAdapter.js';

const intent: OutgoingIntent = {
  type: 'message.send',
  meta: { eventId: 'synthetic-event', occurredAt: '2026-07-22T00:00:00.000Z', source: 'smsc' },
  payload: {
    recipient: { phoneNormalized: '+79990001122' },
    message: { text: 'synthetic message' },
    delivery: { channels: ['smsc'] },
  },
};

describe('createSmscDeliveryAdapter', () => {
  it('converts a provider rejection into one stable failure class', async () => {
    const sendSms = vi.fn().mockResolvedValue({ ok: false, error: 'raw provider response' });
    const adapter = createSmscDeliveryAdapter({ smsClient: { sendSms } });

    await expect(adapter.send(intent)).rejects.toThrow(/^SMSC_PROVIDER_REJECTED$/);
  });

  it('preserves successful delivery', async () => {
    const sendSms = vi.fn().mockResolvedValue({ ok: true });
    const adapter = createSmscDeliveryAdapter({ smsClient: { sendSms } });

    await expect(adapter.send(intent)).resolves.toEqual({});
  });
});
