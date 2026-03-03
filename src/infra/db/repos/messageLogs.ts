import type { DbWriteMutation } from '../../../kernel/contracts/index.js';
import { db } from '../client.js';
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

export type DeliveryAttemptLogRow = {
  id: number;
  intentType: string | null;
  intentEventId: string | null;
  correlationId: string | null;
  channel: string;
  status: 'success' | 'failed';
  attempt: number;
  reason: string | null;
  payloadJson: unknown;
  occurredAt: string;
};

export type DeliveryAttemptStats = {
  total: number;
  success: number;
  failed: number;
};

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function insertDeliveryAttemptLog(params: DeliveryAttemptLogParams): Promise<void> {
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

/** Returns recent delivery attempt logs for read-only admin endpoints. */
export async function getRecentDeliveryAttemptLogs(limit = 100): Promise<DeliveryAttemptLogRow[]> {
  const query = `
    SELECT
      id,
      intent_type,
      intent_event_id,
      correlation_id,
      channel,
      status,
      attempt,
      reason,
      payload_json,
      occurred_at
    FROM delivery_attempt_logs
    ORDER BY occurred_at DESC
    LIMIT $1
  `;
  try {
    const res = await db.query<{
      id: number;
      intent_type: string | null;
      intent_event_id: string | null;
      correlation_id: string | null;
      channel: string;
      status: 'success' | 'failed';
      attempt: number;
      reason: string | null;
      payload_json: unknown;
      occurred_at: Date;
    }>(query, [Math.max(1, Math.min(limit, 500))]);
    return res.rows.map((row) => ({
      id: row.id,
      intentType: row.intent_type,
      intentEventId: row.intent_event_id,
      correlationId: row.correlation_id,
      channel: row.channel,
      status: row.status,
      attempt: row.attempt,
      reason: row.reason,
      payloadJson: row.payload_json,
      occurredAt: row.occurred_at.toISOString(),
    }));
  } catch (err) {
    logger.error({ err }, 'get delivery attempt logs failed');
    return [];
  }
}

/** Returns aggregated delivery attempt counters for read-only admin metrics. */
export async function getDeliveryAttemptStats(hours = 24): Promise<DeliveryAttemptStats> {
  const query = `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'success')::int AS success,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM delivery_attempt_logs
    WHERE occurred_at >= NOW() - ($1::int * INTERVAL '1 hour')
  `;
  try {
    const res = await db.query<{ total: number; success: number; failed: number }>(query, [
      Math.max(1, Math.min(hours, 24 * 30)),
    ]);
    return res.rows[0] ?? { total: 0, success: 0, failed: 0 };
  } catch (err) {
    logger.error({ err }, 'get delivery attempt stats failed');
    return { total: 0, success: 0, failed: 0 };
  }
}

/** Persists audit logs for outgoing delivery attempts and fallback events. */
export async function appendMessageLog(mutation: DbWriteMutation): Promise<void> {
  if (mutation.type === 'delivery.attempt.log') {
    await insertDeliveryAttemptLog(mutation.params as DeliveryAttemptLogParams);
    return;
  }

  // Keep non-delivery logs visible until dedicated audit tables are added.
  logger.info({ mutationType: mutation.type, params: mutation.params }, 'append message/delivery log');
}
