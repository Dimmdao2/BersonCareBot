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

function clinicRequiredIntent(channel: 'telegram' | 'max' | 'smsc' | 'email'): OutgoingIntent {
  return {
    ...messageSendIntent(),
    meta: { ...messageSendIntent().meta, source: channel === 'smsc' ? 'sms' : channel },
    payload: {
      recipient: { chatId: 123 },
      message: { text: 'hello' },
      delivery: { channels: [channel], senderScope: 'clinic_required' },
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

describe('clinic-owned delivery routing', () => {
  it('uses the exact clinic credential for a clinic-required broadcast', async () => {
    const send = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const adapter: DeliveryAdapter = { canHandle: () => true, send };
    const port = createDefaultDispatchPort({
      adapters: [adapter],
      resolveClinicDeliveryCredential: async () => ({
        channel: 'telegram',
        botToken: 'clinic-a-token',
      }),
    });

    await port.dispatchOutgoing(clinicRequiredIntent('telegram'));

    expect(send).toHaveBeenCalledTimes(1);
    expect(
      (send.mock.calls[0]?.[0].payload as { delivery: { clinicCredential: unknown } }).delivery,
    ).toMatchObject({ clinicCredential: { channel: 'telegram', botToken: 'clinic-a-token' } });
  });

  it('fails closed before reaching a provider when a clinic-required credential is absent', async () => {
    const send = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const adapter: DeliveryAdapter = { canHandle: () => true, send };
    const port = createDefaultDispatchPort({
      adapters: [adapter],
      resolveClinicDeliveryCredential: async () => null,
    });

    await expect(port.dispatchOutgoing(clinicRequiredIntent('telegram'))).rejects.toThrow(
      'CLINIC_CHANNEL_NOT_CONFIGURED:telegram',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('falls back to the platform credential only for clinic-preferred essential delivery', async () => {
    const send = vi
      .fn(async (_intent: OutgoingIntent) => ({ telegramMessageId: 0 }))
      .mockRejectedValueOnce(new Error('clinic_provider_failed'))
      .mockResolvedValueOnce({ telegramMessageId: 7 });
    const adapter: DeliveryAdapter = { canHandle: () => true, send };
    const port = createDefaultDispatchPort({
      adapters: [adapter],
      resolveClinicDeliveryCredential: async () => ({
        channel: 'telegram',
        botToken: 'clinic-a-token',
      }),
    });

    await expect(port.dispatchOutgoing(messageSendIntent())).resolves.toEqual({
      telegramMessageId: 7,
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(
      (send.mock.calls[0]?.[0].payload as { delivery: { clinicCredential?: unknown } }).delivery,
    ).toMatchObject({ clinicCredential: { channel: 'telegram', botToken: 'clinic-a-token' } });
    expect(
      (send.mock.calls[1]?.[0].payload as { delivery: { clinicCredential?: unknown } }).delivery,
    ).not.toHaveProperty('clinicCredential');
  });
});
