import type { DbPort, DbWriteMutation } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { deliveryAttemptLogs } from '../schema/integratorPublicProduct.js';

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
  const channel = asString(params.channel);
  const status = asString(params.status);
  const attempt = asNumber(params.attempt);
  if (channel === null || status === null || attempt === null || attempt <= 0) {
    logger.warn({ params }, 'insertDeliveryAttemptLog: skip row with invalid channel/status/attempt');
    return;
  }
  if (status !== 'success' && status !== 'failed') {
    logger.warn({ params, status }, 'insertDeliveryAttemptLog: skip row with status outside success|failed');
    return;
  }
  const d = getIntegratorDrizzleSession(db);
  try {
    await d.insert(deliveryAttemptLogs).values({
      intentType: asString(params.intentType),
      intentEventId: asString(params.intentEventId),
      correlationId: asString(params.correlationId),
      channel,
      status,
      attempt,
      reason: asString(params.reason),
      payloadJson: typeof params.payload === 'object' && params.payload !== null
        ? (params.payload as Record<string, unknown>)
        : {},
      occurredAt: asString(params.occurredAt) ?? new Date().toISOString(),
    });
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
