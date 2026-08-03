import { describe, expect, it, vi } from 'vitest';
import type { DeliveryJob, OutgoingIntent } from '../../../kernel/contracts/index.js';
import { assertOutboundMessagePolicy } from '../../adapters/outboundMessagePolicy.js';
import { executeJob } from './jobExecutor.js';

function legacyAppointmentJob(attempts: number): DeliveryJob {
  return {
    id: 'legacy-appointment-job',
    kind: 'message_retry',
    runAt: '2026-08-03T10:00:00.000Z',
    attempts,
    maxAttempts: 2,
    payload: {
      intent: {
        type: 'message.send',
        meta: {
          eventId: 'appointment-reminder:legacy',
          occurredAt: '2026-08-03T09:00:00.000Z',
          source: 'telegram',
        },
        payload: {
          recipient: { chatId: 'unused-base-recipient' },
          message: { text: 'Напоминание о записи' },
          delivery: { channels: ['telegram', 'max'] },
        },
      },
      targets: [
        { resource: 'telegram', address: { chatId: 'tg-legacy' } },
        { resource: 'max', address: { userId: 'max-legacy' } },
      ],
    },
  };
}

describe('legacy message_retry appointment consumer', () => {
  it('keeps consuming an old persisted row while selecting its historical attempt target', async () => {
    const dispatched: OutgoingIntent[] = [];
    const dispatchOutgoing = vi.fn(async (intent: OutgoingIntent) => {
      dispatched.push(intent);
      return {};
    });

    const first = await executeJob(legacyAppointmentJob(0), { dispatchOutgoing });
    const fallback = await executeJob(legacyAppointmentJob(1), { dispatchOutgoing });

    expect(first).toEqual({ ok: true, final: true });
    expect(fallback).toEqual({ ok: true, final: true });
    expect(dispatched.map((intent) => intent.payload)).toEqual([
      expect.objectContaining({
        recipient: { chatId: 'tg-legacy' },
        delivery: expect.objectContaining({ channels: ['telegram'], maxAttempts: 1 }),
      }),
      expect.objectContaining({
        recipient: { userId: 'max-legacy' },
        delivery: expect.objectContaining({ channels: ['max'], maxAttempts: 1 }),
      }),
    ]);
  });

  it('keeps an old persisted appointment row deliverable through the real outbound policy gate', async () => {
    const providerSend = vi.fn(async () => ({}));
    const dispatchOutgoing = async (intent: OutgoingIntent) => {
      assertOutboundMessagePolicy(intent);
      return providerSend(intent);
    };

    const result = await executeJob(legacyAppointmentJob(0), { dispatchOutgoing });

    expect(result).toEqual({ ok: true, final: true });
    expect(providerSend).toHaveBeenCalledTimes(1);
  });
});
