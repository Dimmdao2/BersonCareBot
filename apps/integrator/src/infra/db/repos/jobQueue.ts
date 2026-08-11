import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import {
  claimDueOutgoingDeliveries,
  enqueueOutgoingDeliveryIfAbsent,
  markOutgoingDeliveryDead,
  markOutgoingDeliverySent,
  resetStaleOutgoingDeliveryProcessing,
} from './outgoingDeliveryQueue.js';
import { getOutgoingDeliveryReclaimConfig } from './outgoingDeliveryReclaimSettings.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

export type MessageRetryJobRow = {
  id: string;
  phoneNormalized: string | null;
  messageText: string | null;
  kind: string | null;
  runAt: string;
  payloadJson: Record<string, unknown> | null;
  attemptsDone: number;
  maxAttempts: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function eventIdFromPayload(payload: Record<string, unknown>): string {
  const intent = asRecord(payload.intent);
  const meta = asRecord(intent.meta);
  return asString(meta.eventId) ?? `message-retry:${randomUUID()}`;
}

function channelFromPayload(payload: Record<string, unknown>): string {
  const intent = asRecord(payload.intent);
  const intentPayload = asRecord(intent.payload);
  const delivery = asRecord(intentPayload.delivery);
  const channels = Array.isArray(delivery.channels) ? delivery.channels : [];
  const firstChannel = channels.map(asString).find((channel) => channel !== null);
  if (firstChannel) return firstChannel;

  const targets = Array.isArray(payload.targets) ? payload.targets : [];
  const target = targets.map(asRecord).find((item) => asString(item.resource) !== null);
  return asString(target?.resource) ?? 'smsc';
}

function messageFields(payload: Record<string, unknown>): {
  phoneNormalized: string | null;
  messageText: string | null;
} {
  const intent = asRecord(payload.intent);
  const intentPayload = asRecord(intent.payload);
  const message = asRecord(intentPayload.message);
  const targets = Array.isArray(payload.targets) ? payload.targets : [];
  const address = asRecord(asRecord(targets[0]).address);
  return {
    phoneNormalized: asString(address.phoneNormalized),
    messageText: asString(message.text),
  };
}

/**
 * Compatibility producer entry point. The former retry queue is now represented by an
 * `inbound_reply` row in the one canonical outgoing-delivery queue; the only worker consumer is
 * `runOutgoingDeliveryWorkerTick`.
 */
export async function enqueueMessageRetryJob(
  db: DbPort,
  input: {
    phoneNormalized: string | null;
    messageText: string | null;
    firstTryDelaySeconds: number;
    /** Prefer an absolute timestamp when the product event has a fixed due time. */
    firstTryAt?: string;
    maxAttempts: number;
    kind: string;
    payloadJson: Record<string, unknown>;
  },
): Promise<void> {
  const delaySec = Math.max(0, Math.trunc(input.firstTryDelaySeconds));
  const eventId = eventIdFromPayload(input.payloadJson);
  const inserted = await enqueueOutgoingDeliveryIfAbsent(db, {
    eventId,
    kind: 'inbound_reply',
    channel: channelFromPayload(input.payloadJson),
    payloadJson: input.payloadJson,
    maxAttempts: Math.max(1, Math.trunc(input.maxAttempts)),
  });
  if (!inserted) return;

  const runAt = input.firstTryAt ?? new Date(Date.now() + delaySec * 1_000).toISOString();
  await runIntegratorSql(
    db,
    sql`UPDATE public.outgoing_delivery_queue
        SET next_retry_at = ${runAt}::timestamptz,
            updated_at = now()
        WHERE event_id = ${eventId}
          AND status = 'pending'`,
  );
}

/**
 * Retained for the retired drain diagnostic only. Runtime worker startup no longer calls this:
 * it uses `claimDueOutgoingDeliveries` through the canonical outgoing-delivery loop.
 */
export async function claimDueMessageRetryJobs(
  db: DbPort,
  limit: number,
): Promise<MessageRetryJobRow[]> {
  const rows = await claimDueOutgoingDeliveries(db, limit);
  return rows.map((row) => {
    const fields = messageFields(row.payloadJson);
    return {
      id: row.id,
      phoneNormalized: fields.phoneNormalized,
      messageText: fields.messageText,
      kind: row.kind,
      runAt: row.nextRetryAt,
      payloadJson: row.payloadJson,
      attemptsDone: row.attemptCount,
      maxAttempts: row.maxAttempts,
    };
  });
}

export async function reclaimStaleMessageRetryJobProcessing(
  db: DbPort,
  staleAfterMinutes: number,
): Promise<number> {
  const config = await getOutgoingDeliveryReclaimConfig(db);
  const result = await resetStaleOutgoingDeliveryProcessing(
    db,
    staleAfterMinutes,
    config.maxReclaimCount,
  );
  return result.reclaimed + result.deadLettered;
}

export async function rescheduleMessageRetryJob(
  db: DbPort,
  input: {
    id: string;
    attemptsDone: number;
    nextRunAt: string;
    lastError?: string;
  },
): Promise<void> {
  await runIntegratorSql(
    db,
    sql`UPDATE public.outgoing_delivery_queue
        SET status = 'failed_retryable',
            attempt_count = ${Math.max(0, Math.trunc(input.attemptsDone))},
            next_retry_at = ${input.nextRunAt}::timestamptz,
            last_error = ${input.lastError ?? null},
            updated_at = now()
        WHERE id = ${input.id}::uuid
          AND status = 'processing'`,
  );
}

export async function completeMessageRetryJob(db: DbPort, id: string): Promise<void> {
  await markOutgoingDeliverySent(db, id);
}

export async function failMessageRetryJob(
  db: DbPort,
  input: { id: string; lastError?: string },
): Promise<void> {
  await markOutgoingDeliveryDead(db, input.id, input.lastError ?? null);
}

export async function cancelPendingBookingReminderJobsByBookingId(
  db: DbPort,
  bookingId: string,
): Promise<void> {
  await runIntegratorSql(
    db,
    sql`UPDATE public.outgoing_delivery_queue
        SET status = 'dead',
            dead_at = now(),
            last_error = 'booking_cancelled',
            updated_at = now()
        WHERE status IN ('pending', 'processing', 'failed_retryable')
          AND payload_json->'booking'->>'bookingId' = ${bookingId}`,
  );
}
