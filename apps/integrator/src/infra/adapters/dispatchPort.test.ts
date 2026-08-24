import { afterEach, describe, expect, it, vi } from 'vitest';

const devRedirect = vi.hoisted(() => ({ active: false }));

vi.mock('../../shared/devDeliveryRedirect.js', () => ({
  isDevRedirectActive: () => devRedirect.active,
  isDevRedirectPassthrough: () => false,
  buildDevPrefix: () => '[DEV] ',
  hasDevPrefix: () => false,
  resolveDevRedirect: () => ({ kind: 'suppress', reason: 'test_binding_missing' }),
}));

import { createDefaultDispatchPort, isProviderAttemptFailure } from './dispatchPort.js';
import type { DeliveryAdapter, OutgoingIntent } from '../../kernel/contracts/index.js';
import { runWithOrganizationPrincipal } from '../principal/organizationPrincipal.js';

afterEach(() => {
  devRedirect.active = false;
});

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

function vkEssentialMessageSendIntent(): OutgoingIntent {
  return {
    type: 'message.send',
    meta: {
      eventId: 'vk:essential:1',
      occurredAt: '2026-08-21T00:00:00.000Z',
      source: 'vk',
      outboundMessageClass: 'routine_product',
      outboundCapability: 'essential_delivery',
    },
    payload: {
      recipient: { userId: 789 },
      message: { text: 'hello' },
      delivery: { channels: ['vk'] },
    },
  } as OutgoingIntent;
}

function clinicRequiredIntent(channel: 'telegram' | 'max' | 'smsc' | 'email'): OutgoingIntent {
  return {
    ...messageSendIntent(),
    meta: {
      ...messageSendIntent().meta,
      source: channel === 'smsc' ? 'sms' : channel,
      outboundMessageClass: 'broadcast_event',
      outboundCapability: 'clinic_delivery',
    },
    payload: {
      recipient: { chatId: 123 },
      message: { text: 'hello' },
      delivery: { channels: [channel], senderScope: 'clinic_required' },
    },
  } as unknown as OutgoingIntent;
}

function clinicIfConfiguredIntent(channel: 'telegram' | 'max'): OutgoingIntent {
  const intent = clinicRequiredIntent(channel);
  return {
    ...intent,
    payload: {
      ...intent.payload,
      delivery: { channels: [channel], senderScope: 'clinic_if_configured' },
    },
  } as OutgoingIntent;
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
      outboundMessageClass: 'broadcast_event',
      outboundCapability: 'clinic_delivery',
    },
  } as OutgoingIntent;
}

describe('Track D F5/F6: dispatchPort never writes success/skip pseudo-attempts', () => {
  // Supersedes the former "D20 item 17" suite. Owner decision
  // (docs/_TODO/runs/integrator-cleanup/TRACK_D_PARTIAL_SALVAGE_AUDIT_2026-08-23.md, F5/F6): a
  // delivery-attempt row is allowed only after a real failed provider call. Success is never an
  // attempt row.
  it('returns the real send result on success and never touches the write port', async () => {
    const send = vi.fn(async () => ({ telegramMessageId: 42 }));
    const writeDb = vi.fn(async () => undefined);
    const port = createDefaultDispatchPort({
      adapters: [{ canHandle: () => true, send }],
      writePort: { writeDb },
    });

    const result = await port.dispatchOutgoing(messageSendIntent());

    expect(result).toEqual({ telegramMessageId: 42 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(writeDb).not.toHaveBeenCalled();
  });
});

describe('Track D F5/F6 follow-up: dispatchPort records a real attempt for non-queue-backed failures', () => {
  // The operator journal is "deliberately shared by all producers" (operatorDeliveryAttempts.ts).
  // A queue-backed caller (the outgoing-delivery worker) passes opts.skipAttemptLog and records its
  // own better attempt (real queue row id + real attempt count) in handleDispatchFailure. Every
  // other caller (OTP/booking/admin relay routes) has no queue row, so dispatchPort itself records
  // the one real attempt — attempt: 1 is a true fact for these single-shot, non-retried sends.
  it('rejects with the original provider error and records exactly one failed attempt', async () => {
    const providerError = new Error('provider_rejected');
    const send = vi.fn(async () => {
      throw providerError;
    });
    const adapter: DeliveryAdapter = { canHandle: () => true, send };
    const writeDb = vi.fn(async () => undefined);
    const port = createDefaultDispatchPort({ adapters: [adapter], writePort: { writeDb } });

    await expect(port.dispatchOutgoing(messageSendIntent())).rejects.toBe(providerError);
    expect(send).toHaveBeenCalledTimes(1);
    expect(writeDb).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'delivery.attempt.log',
        params: expect.objectContaining({ channel: 'telegram', status: 'failed', attempt: 1 }),
      }),
    );
  });

  it('does not record an attempt for a recipient_blocked_bot rejection', async () => {
    const blockedError = new Error('bot was blocked by the user');
    const send = vi.fn(async () => {
      throw blockedError;
    });
    const adapter: DeliveryAdapter = { canHandle: () => true, send };
    const writeDb = vi.fn(async () => undefined);
    const port = createDefaultDispatchPort({ adapters: [adapter], writePort: { writeDb } });

    await expect(port.dispatchOutgoing(messageSendIntent())).rejects.toBe(blockedError);
    expect(writeDb).not.toHaveBeenCalled();
  });

  it('skips its own attempt write when the caller passes opts.skipAttemptLog (queue-backed worker)', async () => {
    const providerError = new Error('provider_rejected');
    const send = vi.fn(async () => {
      throw providerError;
    });
    const adapter: DeliveryAdapter = { canHandle: () => true, send };
    const writeDb = vi.fn(async () => undefined);
    const port = createDefaultDispatchPort({ adapters: [adapter], writePort: { writeDb } });

    await expect(
      port.dispatchOutgoing(messageSendIntent(), { skipAttemptLog: true }),
    ).rejects.toBe(providerError);
    expect(writeDb).not.toHaveBeenCalled();
  });

  it('rethrows the provider error unchanged when no write port is configured (test-only omission)', async () => {
    const providerError = new Error('provider_rejected');
    const send = vi.fn(async () => {
      throw providerError;
    });
    const adapter: DeliveryAdapter = { canHandle: () => true, send };
    const port = createDefaultDispatchPort({ adapters: [adapter] });

    await expect(port.dispatchOutgoing(messageSendIntent())).rejects.toBe(providerError);
  });

  it('brands only the normalized primitive provider rejection, never a separate ordinary Error', async () => {
    const primitiveProviderRejection = 'provider_socket_closed';
    const send = vi.fn(async () => {
      throw primitiveProviderRejection;
    });
    const port = createDefaultDispatchPort({ adapters: [{ canHandle: () => true, send }] });

    const received = await port.dispatchOutgoing(messageSendIntent()).catch((error: unknown) => error);

    expect(received).toBeInstanceOf(Error);
    expect(isProviderAttemptFailure(received)).toBe(true);
    expect(isProviderAttemptFailure(new Error('ordinary_pre_provider_error'))).toBe(false);
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

  it('uses the platform sender for patient traffic when the clinic has no enabled credential', async () => {
    const send = vi.fn(async (_intent: OutgoingIntent) => ({ telegramMessageId: 7 }));
    const port = createDefaultDispatchPort({
      adapters: [{ canHandle: () => true, send }],
      resolveClinicDeliveryCredential: async () => null,
    });

    await expect(port.dispatchOutgoing(clinicIfConfiguredIntent('telegram'))).resolves.toEqual({
      telegramMessageId: 7,
    });
    expect(send).toHaveBeenCalledOnce();
    expect(
      (send.mock.calls[0]?.[0].payload as { delivery: { clinicCredential?: unknown } }).delivery,
    ).not.toHaveProperty('clinicCredential');
  });

  it('does not fall back to the platform sender after an enabled clinic bot fails', async () => {
    const clinicError = new Error('clinic_provider_failed');
    const send = vi.fn(async (_intent: OutgoingIntent) => {
      throw clinicError;
    });
    const port = createDefaultDispatchPort({
      adapters: [{ canHandle: () => true, send }],
      resolveClinicDeliveryCredential: async () => ({
        channel: 'telegram',
        botToken: 'clinic-a-token',
      }),
    });

    await expect(port.dispatchOutgoing(clinicIfConfiguredIntent('telegram'))).rejects.toBe(
      clinicError,
    );
    expect(send).toHaveBeenCalledOnce();
    expect(
      (send.mock.calls[0]?.[0].payload as { delivery: { clinicCredential?: unknown } }).delivery,
    ).toMatchObject({ clinicCredential: { channel: 'telegram', botToken: 'clinic-a-token' } });
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

  it('does not report a live clinic probe as delivered when the DEV redirect suppresses it', async () => {
    devRedirect.active = true;
    const send = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const port = createDefaultDispatchPort({
      adapters: [{ canHandle: () => true, send }],
      resolveClinicDeliveryCredential: async () => ({
        channel: 'telegram',
        botToken: 'saved-clinic-token',
      }),
    });
    const intent = essentialMessageSendIntent();
    intent.payload = {
      ...intent.payload,
      delivery: { channels: ['telegram'], clinicCredentialProbe: true },
    };

    await expect(port.dispatchOutgoing(intent)).rejects.toThrow('CLINIC_CHANNEL_PROBE_SUPPRESSED');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('D31 VK common dispatch acceptance', () => {
  it('passes an authorized VK delivery through the shared adapter', async () => {
    const send = vi.fn(async () => ({ vkMessageId: '77' }));
    const port = createDefaultDispatchPort({
      adapters: [{ canHandle: () => true, send }],
      isPlatformIntegrationEnabled: async () => true,
    });

    await expect(port.dispatchOutgoing(vkEssentialMessageSendIntent())).resolves.toEqual({
      vkMessageId: '77',
    });
    expect(send).toHaveBeenCalledOnce();
  });
});
