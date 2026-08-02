import { describe, expect, it, vi } from 'vitest';
import type {
  DbPort,
  DbQueryResult,
  DeliverySendResult,
  OutgoingIntent,
} from '../../../kernel/contracts/index.js';
import type { OutgoingDeliveryQueueRow } from '../../db/repos/outgoingDeliveryQueue.js';
import { processOutgoingDeliveryRow } from './outgoingDeliveryWorker.js';

type GateRow = {
  current_generation: number;
  occurrence_status: string;
  rule_enabled: boolean;
  muted: boolean;
  terminal_action: boolean;
  channel_enabled: boolean;
  topic_enabled: boolean;
};

const OCCURRENCE_ID = 'd21-occurrence';

function row(channel: 'telegram' | 'max' | 'web_push' | 'email', generation = 2): OutgoingDeliveryQueueRow {
  const intent: OutgoingIntent = {
    type: 'message.send',
    meta: {
      eventId: `rem:${OCCURRENCE_ID}:g${generation}:${channel}`,
      occurredAt: '2026-08-02T12:00:00.000Z',
      source: channel,
      userId: '42',
    },
    payload: {
      recipient:
        channel === 'web_push'
          ? { pushUserId: 'a0000000-0000-4000-8000-00000000000a' }
          : channel === 'email'
            ? { email: 'patient@example.test' }
          : { chatId: channel === 'telegram' ? 1001 : 1002 },
      message: { text: 'Reminder' },
      delivery: { channels: [channel] },
    },
  };
  return {
    id: `queue-${channel}-${generation}`,
    eventId: intent.meta.eventId,
    kind: 'reminder_dispatch',
    channel,
    payloadJson: {
      occurrenceId: OCCURRENCE_ID,
      deliveryGeneration: generation,
      topicCode: 'training_reminders',
      channel,
      deliveryLogId: `rdl:${OCCURRENCE_ID}:g${generation}:${channel}`,
      platformUserId: 'a0000000-0000-4000-8000-00000000000a',
      externalId:
        channel === 'telegram'
          ? '1001'
          : channel === 'email'
            ? 'patient@example.test'
            : '1002',
      logText: 'Reminder',
      intent,
    },
    status: 'processing',
    attemptCount: 1,
    maxAttempts: 6,
    nextRetryAt: '2026-08-02T12:00:00.000Z',
    lastAttemptAt: null,
    sentAt: null,
    deadAt: null,
    lastError: null,
  };
}

function harness(
  gate: GateRow,
  options: { emailRateLimited?: boolean; deliveryResult?: DeliverySendResult } = {},
) {
  const dispatchOutgoing = vi.fn(async (_intent: OutgoingIntent) =>
    options.deliveryResult ?? {
      telegramMessageId: 7,
      maxMessageId: 'm-7',
      webPushOutcome: {
        status: 'success' as const,
        delivered: 1,
        errors: 0,
        deactivated: 0,
      },
    },
  );
  const writes: Array<{ type: string; params: Record<string, unknown> }> = [];
  const queueSent: string[] = [];
  const queueRetryable: string[] = [];
  const db: DbPort = {
    async query<T>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>> {
      if (sql.includes('occurrence.delivery_generation AS current_generation')) {
        return { rows: [gate] as T[] };
      }
      if (sql.includes('COALESCE(o.organization_id')) {
        return {
          rows: [{ organization_id: 'd0000000-0000-4000-8000-00000000000d' }] as T[],
        };
      }
      if (sql.includes('read_reminder_transactional_email_cooldown')) {
        return { rows: [{ rate_limited: options.emailRateLimited === true }] as T[] };
      }
      if (sql.includes("SET status = 'sent'")) {
        queueSent.push(String(params?.at(-1) ?? ''));
      }
      if (sql.includes("SET status = 'failed_retryable'")) {
        queueRetryable.push(String(params?.at(-1) ?? ''));
      }
      return { rows: [] as T[] };
    },
    async tx<T>(fn: (tx: DbPort) => Promise<T>): Promise<T> {
      return fn(db);
    },
  };
  return {
    db,
    dispatchOutgoing,
    writes,
    queueSent,
    queueRetryable,
    writePort: {
      async writeDb(mutation: { type: string; params: Record<string, unknown> }) {
        writes.push(mutation);
      },
    },
  };
}

const allowedGate: GateRow = {
  current_generation: 2,
  occurrence_status: 'sent',
  rule_enabled: true,
  muted: false,
  terminal_action: false,
  channel_enabled: true,
  topic_enabled: true,
};

describe('D21 reminder delivery generation gate', () => {
  it.each([
    ['stale generation', { ...allowedGate, current_generation: 3 }],
    ['done/skip', { ...allowedGate, terminal_action: true }],
    ['mute', { ...allowedGate, muted: true }],
    ['topic disable', { ...allowedGate, topic_enabled: false }],
    ['channel disable', { ...allowedGate, channel_enabled: false }],
  ])('%s finalizes the queue leg without calling a provider', async (_label, gate) => {
    const h = harness(gate);
    await processOutgoingDeliveryRow(row('telegram'), h as never);
    expect(h.dispatchOutgoing).not.toHaveBeenCalled();
    expect(h.queueSent).toEqual(['queue-telegram-2']);
  });

  it('a sent occurrence does not suppress the sibling channel in the same generation', async () => {
    const h = harness(allowedGate);
    await processOutgoingDeliveryRow(row('max'), h as never);
    expect(h.dispatchOutgoing).toHaveBeenCalledTimes(1);
    expect(h.writes.map((write) => write.type)).toEqual([
      'reminders.delivery.log',
      'reminders.occurrence.markSent',
    ]);
    expect(h.queueSent).toEqual(['queue-max-2']);
  });

  it('the integrator worker invokes the Web Push provider leg after the same canonical gate', async () => {
    const h = harness(allowedGate);
    await processOutgoingDeliveryRow(row('web_push'), h as never);
    expect(h.dispatchOutgoing).toHaveBeenCalledTimes(1);
    expect(h.dispatchOutgoing.mock.calls[0]![0].payload).toEqual(
      expect.objectContaining({
        recipient: { pushUserId: 'a0000000-0000-4000-8000-00000000000a' },
        delivery: { channels: ['web_push'] },
      }),
    );
    expect(h.queueSent).toEqual(['queue-web_push-2']);
  });

  it('a skipped Web Push provider outcome closes the leg without marking reminder success', async () => {
    const h = harness(allowedGate, {
      deliveryResult: {
        webPushOutcome: {
          status: 'skipped',
          reason: 'no_active_subscriptions',
          delivered: 0,
          errors: 0,
          deactivated: 0,
        },
      },
    });
    await processOutgoingDeliveryRow(row('web_push'), h as never);
    expect(h.dispatchOutgoing).toHaveBeenCalledTimes(1);
    expect(h.writes).toEqual([]);
    expect(h.queueSent).toEqual(['queue-web_push-2']);
  });

  it('a failed Web Push provider outcome enters the isolated retry path', async () => {
    const h = harness(allowedGate, {
      deliveryResult: {
        webPushOutcome: {
          status: 'failed',
          reason: 'provider_error',
          delivered: 0,
          errors: 1,
          deactivated: 0,
          providerStatusCode: 503,
          providerErrorCode: 'push_unavailable',
        },
      },
    });
    await processOutgoingDeliveryRow(row('web_push'), h as never);
    expect(h.writes).toEqual([]);
    expect(h.queueSent).toEqual([]);
    expect(h.queueRetryable).toEqual(['queue-web_push-2']);
  });

  it('the integrator worker delivers email through the same gate and records cooldown', async () => {
    const h = harness(allowedGate);
    await processOutgoingDeliveryRow(row('email'), h as never);
    expect(h.dispatchOutgoing).toHaveBeenCalledTimes(1);
    expect(h.dispatchOutgoing.mock.calls[0]![0].payload).toEqual(
      expect.objectContaining({
        recipient: { email: 'patient@example.test' },
        delivery: { channels: ['email'] },
      }),
    );
    expect(h.queueSent).toEqual(['queue-email-2']);
  });

  it('email cooldown consumes only the email leg without calling the provider', async () => {
    const h = harness(allowedGate, { emailRateLimited: true });
    await processOutgoingDeliveryRow(row('email'), h as never);
    expect(h.dispatchOutgoing).not.toHaveBeenCalled();
    expect(h.queueSent).toEqual(['queue-email-2']);
  });
});
