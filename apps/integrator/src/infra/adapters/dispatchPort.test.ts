import { describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/devDeliveryRedirect.js', () => ({
  isDevRedirectActive: () => false,
}));

import { createDefaultDispatchPort } from './dispatchPort.js';
import type { DbWritePort, DeliveryAdapter, OutgoingIntent } from '../../kernel/contracts/index.js';
import { runWithOrganizationPrincipal } from '../principal/organizationPrincipal.js';

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

function essentialMessageSendIntent(): OutgoingIntent {
  return {
    ...messageSendIntent(),
    meta: {
      ...messageSendIntent().meta,
      eventId: 'otp:clinic-essential',
      outboundMessageClass: 'auth_code',
      outboundCapability: 'auth_code',
    },
  } as OutgoingIntent;
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

function queuedClinicBroadcastIntent(): OutgoingIntent {
  const intent = clinicRequiredIntent('telegram');
  return {
    ...intent,
    meta: {
      eventId: 'broadcast:audit:patient:tg',
      occurredAt: '2026-08-02T00:00:00.000Z',
      source: 'telegram',
      userId: 'patient-1',
    },
  } as OutgoingIntent;
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

    await expect(port.dispatchOutgoing(essentialMessageSendIntent())).resolves.toEqual({
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

  it('blocks a globally disabled channel before clinic credential resolution or provider send', async () => {
    const send = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const resolveClinicDeliveryCredential = vi.fn(async () => ({
      channel: 'telegram' as const,
      botToken: 'clinic-a-token',
    }));
    const port = createDefaultDispatchPort({
      adapters: [{ canHandle: () => true, send }],
      isPlatformIntegrationEnabled: async () => false,
      resolveClinicDeliveryCredential,
    });

    await expect(port.dispatchOutgoing(essentialMessageSendIntent())).rejects.toThrow(
      'PLATFORM_INTEGRATION_DISABLED:telegram',
    );
    expect(resolveClinicDeliveryCredential).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps platform-system delivery on the platform sender even inside an organization context', async () => {
    const send = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const resolveClinicDeliveryCredential = vi.fn(async () => ({
      channel: 'telegram' as const,
      botToken: 'clinic-a-token',
    }));
    const port = createDefaultDispatchPort({
      adapters: [{ canHandle: () => true, send }],
      resolveClinicDeliveryCredential,
    });

    await runWithOrganizationPrincipal('11111111-1111-4111-8111-111111111111', () =>
      port.dispatchOutgoing(messageSendIntent()),
    );

    expect(send).toHaveBeenCalledOnce();
    expect(
      (send.mock.calls[0]?.[0].payload as { delivery: { clinicCredential?: unknown } }).delivery,
    ).not.toHaveProperty('clinicCredential');
  });

  it('accepts the clinic-required messenger broadcast intent produced by the delivery queue', async () => {
    const send = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const port = createDefaultDispatchPort({
      adapters: [{ canHandle: () => true, send }],
      resolveClinicDeliveryCredential: async () => ({
        channel: 'telegram',
        botToken: 'clinic-a-token',
      }),
    });

    await expect(port.dispatchOutgoing(queuedClinicBroadcastIntent())).resolves.toEqual({});
    expect(send).toHaveBeenCalledOnce();
  });
});
