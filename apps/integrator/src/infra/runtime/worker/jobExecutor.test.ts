import { describe, expect, it, vi } from 'vitest';
import { assertWebappPushNotifyAccepted, executeJob } from './jobExecutor.js';
import {
  OutboundMessagePolicyError,
  OUTBOUND_MESSAGE_POLICY_DENIED,
} from '../../adapters/outboundMessagePolicy.js';

describe('executeJob', () => {
  it('converts a non-ok webapp M2M response into a retryable executor error', () => {
    expect(() => assertWebappPushNotifyAccepted({ ok: false, status: 500 }))
      // eslint-disable-next-line no-secrets/no-secrets -- closed internal error code, not credential material
      .toThrow('WEBAPP_PUSH_NOTIFY_FAILED:500');
    expect(() => assertWebappPushNotifyAccepted({ ok: true, status: 200 })).not.toThrow();
  });
  it('returns ok=true when dispatch succeeds', async () => {
    const result = await executeJob(
      {
        id: 'job-1',
        kind: 'message.deliver',
        runAt: '2026-03-05T12:00:00.000Z',
        attempts: 0,
        maxAttempts: 3,
        payload: {
          intent: {
            type: 'message.send',
            meta: {
              eventId: 'out-1',
              occurredAt: '2026-03-05T12:00:00.000Z',
              source: 'domain',
            },
            payload: {
              message: { text: 'hello' },
              delivery: { channels: ['channel-a', 'channel-b'] },
            },
          },
          targets: [{ resource: 'channel-a', address: { phoneNormalized: '+79990001122' } }],
        },
      },
      {
        dispatchOutgoing: vi.fn().mockResolvedValue({}),
      },
    );

    expect(result.ok).toBe(true);
  });

  it('returns failed result when dispatch fails', async () => {
    const result = await executeJob(
      {
        id: 'job-2',
        kind: 'message.deliver',
        runAt: '2026-03-05T12:00:00.000Z',
        attempts: 0,
        maxAttempts: 3,
        payload: {
          intent: {
            type: 'message.send',
            meta: {
              eventId: 'out-2',
              occurredAt: '2026-03-05T12:00:00.000Z',
              source: 'domain',
            },
            payload: {
              message: { text: 'hello' },
              delivery: { channels: ['channel-a'] },
            },
          },
          targets: [{ resource: 'channel-a', address: { phoneNormalized: '+79990001122' } }],
        },
      },
      {
        dispatchOutgoing: vi.fn().mockRejectedValue(new Error('CHANNEL_DOWN')),
      },
    );

    expect(result.ok).toBe(false);
    expect(result.errorCode).toContain('CHANNEL_DOWN');
  });

  it('strips forged auth metadata and finalizes a legacy booking policy denial', async () => {
    const dispatchOutgoing = vi.fn().mockImplementation(async (intent) => {
      expect(intent.meta).not.toHaveProperty('outboundMessageClass');
      expect(intent.meta).not.toHaveProperty('outboundCapability');
      throw new OutboundMessagePolicyError('missing_or_invalid_marker');
    });
    const result = await executeJob(
      {
        id: 'job-forged-auth',
        kind: 'message.deliver',
        runAt: '2026-03-05T12:00:00.000Z',
        attempts: 0,
        maxAttempts: 3,
        payload: {
          intent: {
            type: 'message.send',
            meta: {
              eventId: 'legacy-booking',
              occurredAt: '2026-03-05T12:00:00.000Z',
              source: 'telegram',
              outboundMessageClass: 'auth_code',
              outboundCapability: 'auth_code',
            },
            payload: { message: { text: 'legacy text' }, delivery: { channels: ['telegram'] } },
          },
          targets: [{ resource: 'telegram', address: { chatId: '123' } }],
        },
      },
      { dispatchOutgoing },
    );

    expect(result).toEqual({ ok: false, errorCode: OUTBOUND_MESSAGE_POLICY_DENIED, final: true });
  });

  it('fails instead of silently skipping a queued webapp push without organizationId', async () => {
    const dispatchWebappPush = vi.fn();
    const result = await executeJob(
      {
        id: 'job-push-no-org',
        kind: 'message.deliver',
        runAt: '2026-03-05T12:00:00.000Z',
        attempts: 0,
        maxAttempts: 3,
        payload: {
          intent: {
            type: 'message.send',
            meta: { eventId: 'out-push', occurredAt: '2026-03-05T12:00:00.000Z', source: 'worker' },
            payload: { message: { text: 'hello' }, delivery: { channels: ['channel-a'] } },
          },
          targets: [{ resource: 'channel-a', address: { phoneNormalized: '+79990001122' } }],
          webappPushNotify: {
            phoneNormalized: '+79990001122',
            slotStartIso: '2026-03-06T12:00:00.000Z',
            stableKey: 'booking:1:24h',
          },
        },
      },
      { dispatchOutgoing: vi.fn().mockResolvedValue({}), dispatchWebappPush },
    );
    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        final: false,
        errorCode: 'INVALID_WEBAPP_PUSH_NOTIFY_PAYLOAD',
      }),
    );
    expect(dispatchWebappPush).not.toHaveBeenCalled();
  });

  it('passes organizationId to the queued webapp push dispatcher', async () => {
    const dispatchWebappPush = vi.fn().mockResolvedValue(undefined);
    const result = await executeJob(
      {
        id: 'job-push-org',
        kind: 'message.deliver',
        runAt: '2026-03-05T12:00:00.000Z',
        attempts: 0,
        maxAttempts: 3,
        payload: {
          intent: {
            type: 'message.send',
            meta: { eventId: 'out-push', occurredAt: '2026-03-05T12:00:00.000Z', source: 'worker' },
            payload: { message: { text: 'hello' }, delivery: { channels: ['channel-a'] } },
          },
          targets: [{ resource: 'channel-a', address: { phoneNormalized: '+79990001122' } }],
          webappPushNotify: {
            organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            phoneNormalized: '+79990001122',
            slotStartIso: '2026-03-06T12:00:00.000Z',
            stableKey: 'booking:1:24h',
          },
        },
      },
      { dispatchOutgoing: vi.fn().mockResolvedValue({}), dispatchWebappPush },
    );
    expect(result.ok).toBe(true);
    expect(dispatchWebappPush).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    );
  });

  it('fails a queued webapp push when the dispatcher is unavailable', async () => {
    const result = await executeJob(
      {
        id: 'job-push-unavailable',
        kind: 'message.deliver',
        runAt: '2026-03-05T12:00:00.000Z',
        attempts: 0,
        maxAttempts: 3,
        payload: {
          intent: {
            type: 'message.send',
            meta: { eventId: 'out-push', occurredAt: '2026-03-05T12:00:00.000Z', source: 'worker' },
            payload: { message: { text: 'hello' }, delivery: { channels: ['channel-a'] } },
          },
          targets: [{ resource: 'channel-a', address: { phoneNormalized: '+79990001122' } }],
          webappPushNotify: {
            organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            phoneNormalized: '+79990001122',
            slotStartIso: '2026-03-06T12:00:00.000Z',
            stableKey: 'booking:1:24h',
          },
        },
      },
      { dispatchOutgoing: vi.fn().mockResolvedValue({}) },
    );
    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        final: false,
        errorCode: 'WEBAPP_PUSH_DISPATCH_UNAVAILABLE',
      }),
    );
  });
});
