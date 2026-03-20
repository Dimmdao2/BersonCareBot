import type { DbPort, DbWriteMutation } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';

type DeliveryAttemptLogParams = {
  intentType?: unknown;
  intentEventId?: unknown;
  correlationId?: unknown;
  channel?: unknown;
  status?: unknown;
  attempt?: unknown;
  reason?: unknown;
  payload?: unknown;
  occurredAt?: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function insertDeliveryAttemptLog(db: DbPort, params: DeliveryAttemptLogParams): Promise<void> {
  const query = `
    INSERT INTO delivery_attempt_logs (
      intent_type,
      intent_event_id,
      correlation_id,
      channel,
      status,
      attempt,
      reason,
      payload_json,
      occurred_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
  `;
  try {
    await db.query(query, [
      asString(params.intentType),
      asString(params.intentEventId),
      asString(params.correlationId),
      asString(params.channel),
      asString(params.status),
      asNumber(params.attempt),
      asString(params.reason),
      JSON.stringify(params.payload ?? {}),
      asString(params.occurredAt) ?? new Date().toISOString(),
    ]);
  } catch (err) {
    logger.error({ err, params }, 'insert delivery attempt log failed');
  }
}

/** Persists audit logs for outgoing delivery attempts and fallback events. */
export async function appendMessageLog(db: DbPort, mutation: DbWriteMutation): Promise<void> {
  if (mutation.type === 'delivery.attempt.log') {
    await insertDeliveryAttemptLog(db, mutation.params as DeliveryAttemptLogParams);
    return;
  }

  // Keep non-delivery logs visible until dedicated audit tables are added.
  logger.info({ mutationType: mutation.type, params: mutation.params }, 'append message/delivery log');
}
