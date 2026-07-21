import { describe, expect, it, vi } from 'vitest';
import { runWorkerTick } from './runner.js';
import { OutboundMessagePolicyError, OUTBOUND_MESSAGE_POLICY_DENIED } from '../../adapters/outboundMessagePolicy.js';

describe('runWorkerTick', () => {
  it('returns idle when no jobs', async () => {
    const result = await runWorkerTick({
      claimNextJob: vi.fn().mockResolvedValue(null),
      completeJob: vi.fn().mockResolvedValue(undefined),
      failJob: vi.fn().mockResolvedValue(undefined),
      rescheduleJob: vi.fn().mockResolvedValue(undefined),
      logAttempt: vi.fn().mockResolvedValue(undefined),
      dispatchOutgoing: vi.fn().mockResolvedValue({}),
      nowIso: () => '2026-03-05T12:00:00.000Z',
      retryDelaySeconds: 60,
    });
    expect(result).toBe('idle');
  });

  it('completes successful jobs', async () => {
    const completeJob = vi.fn().mockResolvedValue(undefined);
    const result = await runWorkerTick({
      claimNextJob: vi.fn().mockResolvedValue({
        id: 'j1',
        kind: 'message.deliver',
        runAt: '2026-03-05T12:00:00.000Z',
        attempts: 0,
        maxAttempts: 3,
        payload: {
          intent: {
            type: 'message.send',
            meta: { eventId: 'evt-1', occurredAt: '2026-03-05T12:00:00.000Z', source: 'worker' },
            payload: {
              message: { text: 'hello' },
              delivery: { channels: ['channel-a'] },
            },
          },
          targets: [{ resource: 'channel-a', address: { phoneNormalized: '+79990001122' } }],
        },
      }),
      completeJob,
      failJob: vi.fn().mockResolvedValue(undefined),
      rescheduleJob: vi.fn().mockResolvedValue(undefined),
      logAttempt: vi.fn().mockResolvedValue(undefined),
      dispatchOutgoing: vi.fn().mockResolvedValue({}),
      nowIso: () => '2026-03-05T12:00:00.000Z',
      retryDelaySeconds: 60,
    });

    expect(result).toBe('processed');
    expect(completeJob).toHaveBeenCalledTimes(1);
  });

  it('reschedules when the webapp push dispatcher rejects the M2M call', async () => {
    const completeJob = vi.fn();
    const rescheduleJob = vi.fn().mockResolvedValue(undefined);
    const result = await runWorkerTick({
      claimNextJob: vi.fn().mockResolvedValue({
        id: 'j-push-fail', kind: 'message.deliver', runAt: '2026-03-05T12:00:00.000Z', attempts: 0, maxAttempts: 3,
        payload: {
          intent: {
            type: 'message.send',
            meta: { eventId: 'evt-push', occurredAt: '2026-03-05T12:00:00.000Z', source: 'worker' },
            payload: { message: { text: 'hello' }, delivery: { channels: ['channel-a'] } },
          },
          targets: [{ resource: 'channel-a', address: { phoneNormalized: '+79990001122' } }],
          webappPushNotify: {
            organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            phoneNormalized: '+79990001122', slotStartIso: '2026-03-06T12:00:00.000Z', stableKey: 'booking:1:24h',
          },
        },
      }),
      completeJob,
      failJob: vi.fn(),
      rescheduleJob,
      logAttempt: vi.fn().mockResolvedValue(undefined),
      dispatchOutgoing: vi.fn().mockResolvedValue({}),
      // eslint-disable-next-line no-secrets/no-secrets -- closed internal error code, not credential material
      dispatchWebappPush: vi.fn().mockRejectedValue(new Error('WEBAPP_PUSH_NOTIFY_FAILED:500')),
      nowIso: () => '2026-03-05T12:00:00.000Z',
      retryDelaySeconds: 60,
    });
    expect(result).toBe('processed');
    expect(completeJob).not.toHaveBeenCalled();
    expect(rescheduleJob).toHaveBeenCalledWith('j-push-fail', '2026-03-05T12:01:00.000Z', 1);
  });

  it('finalizes a legacy booking policy denial without retry or payload-bearing error', async () => {
    const failJob = vi.fn().mockResolvedValue(undefined);
    const rescheduleJob = vi.fn().mockResolvedValue(undefined);
    const logAttempt = vi.fn().mockResolvedValue(undefined);
    await runWorkerTick({
      claimNextJob: vi.fn().mockResolvedValue({
        id: 'booking-policy-denied', kind: 'message.deliver', runAt: '2026-03-05T12:00:00.000Z', attempts: 0, maxAttempts: 3,
        payload: {
          intent: {
            type: 'message.send',
            meta: {
              eventId: 'booking-event', occurredAt: '2026-03-05T12:00:00.000Z', source: 'telegram',
              outboundMessageClass: 'auth_code', outboundCapability: 'auth_code',
            },
            payload: { message: { text: 'sensitive booking body' }, delivery: { channels: ['telegram'] } },
          },
          targets: [{ resource: 'telegram', address: { chatId: '123' } }],
        },
      }),
      completeJob: vi.fn(), failJob, rescheduleJob, logAttempt,
      dispatchOutgoing: vi.fn().mockRejectedValue(new OutboundMessagePolicyError('missing_or_invalid_marker')),
      nowIso: () => '2026-03-05T12:00:00.000Z', retryDelaySeconds: 60,
    });

    expect(rescheduleJob).not.toHaveBeenCalled();
    expect(failJob).toHaveBeenCalledWith('booking-policy-denied', OUTBOUND_MESSAGE_POLICY_DENIED);
    expect(logAttempt).toHaveBeenCalledWith('booking-policy-denied', {
      ok: false, final: true, errorCode: OUTBOUND_MESSAGE_POLICY_DENIED,
    });
    expect(JSON.stringify(logAttempt.mock.calls)).not.toContain('sensitive booking body');
  });
});
