import { sql } from 'drizzle-orm';
import type { DbPort, DbWriteMutation } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import { runWithInfraPrincipal } from '../../principal/organizationPrincipal.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';
import { getOperationalVerboseLogEnabled } from './operationalVerboseLog.js';

type DeliveryAttemptLogParams = {
  intentType?: unknown;
  intentEventId?: unknown;
  correlationId?: unknown;
  organizationId?: unknown;
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

/** PII-safe подмножество полей для warn/error (без сырого `payload`). */
function safeAttemptFields(params: DeliveryAttemptLogParams): Record<string, unknown> {
  return {
    intentType: asString(params.intentType),
    intentEventId: asString(params.intentEventId),
    correlationId: asString(params.correlationId),
    organizationId: asString(params.organizationId),
    channel: asString(params.channel),
    status: asString(params.status),
    attempt: asNumber(params.attempt),
    reason: asString(params.reason),
  };
}

export async function insertDeliveryAttemptLog(
  db: DbPort,
  params: DeliveryAttemptLogParams,
): Promise<void> {
  const channel = asString(params.channel);
  const status = asString(params.status);
  const attempt = asNumber(params.attempt);
  if (channel === null || status === null || attempt === null || attempt <= 0) {
    const error = new Error('DELIVERY_ATTEMPT_LOG_INVALID_FIELDS');
    logger.error(
      { code: 'DELIVERY_ATTEMPT_LOG_INVALID_FIELDS', ...safeAttemptFields(params) },
      'insertDeliveryAttemptLog: cannot persist row with invalid channel/status/attempt',
    );
    throw error;
  }
  if (status !== 'success' && status !== 'failed' && status !== 'skipped') {
    const error = new Error('DELIVERY_ATTEMPT_LOG_INVALID_STATUS');
    logger.error(
      { code: 'DELIVERY_ATTEMPT_LOG_INVALID_STATUS', ...safeAttemptFields(params) },
      'insertDeliveryAttemptLog: cannot persist row with status outside success|failed',
    );
    throw error;
  }
  try {
    const intentType = asString(params.intentType);
    const intentEventId = asString(params.intentEventId);
    const correlationId = asString(params.correlationId);
    const organizationId = asString(params.organizationId);
    const reason = asString(params.reason);
    const payloadJson =
      typeof params.payload === 'object' && params.payload !== null
        ? (params.payload as Record<string, unknown>)
        : {};
    const occurredAt = asString(params.occurredAt) ?? new Date().toISOString();
    const payloadText = JSON.stringify(payloadJson);
    await runWithInfraPrincipal({ source: 'delivery-handler' }, () =>
      runIntegratorNamedRoot(
        db,
        'app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)',
        [
          intentType,
          intentEventId,
          correlationId,
          organizationId,
          channel,
          status,
          attempt,
          reason,
          payloadText,
          occurredAt,
        ],
        sql`SELECT app.record_operational_delivery_attempt_audit(
          ${intentType}, ${intentEventId}, ${correlationId}, ${organizationId}::uuid, ${channel}, ${status}, ${attempt}, ${reason}, ${payloadText}, ${occurredAt}::timestamptz
        )`,
      ),
    );
  } catch (err) {
    logger.error(
      { err, code: 'DELIVERY_ATTEMPT_LOG_INSERT_FAILED', ...safeAttemptFields(params) },
      'insert delivery attempt log failed',
    );
    throw err;
  }
}

/** Persists audit logs for outgoing delivery attempts and fallback events. */
export async function appendMessageLog(db: DbPort, mutation: DbWriteMutation): Promise<void> {
  if (mutation.type === 'delivery.attempt.log') {
    await insertDeliveryAttemptLog(db, mutation.params as DeliveryAttemptLogParams);
    return;
  }

  // Non-delivery logs are diagnostic-only until dedicated audit tables exist; gate behind verbose flag and drop raw params.
  if (await getOperationalVerboseLogEnabled(db)) {
    logger.info({ mutationType: mutation.type }, 'append message/delivery log');
  }
}
