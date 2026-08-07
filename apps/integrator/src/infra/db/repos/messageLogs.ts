import { sql } from 'drizzle-orm';
import type { DbPort, DbWriteMutation } from '../../../kernel/contracts/index.js';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { logger } from '../../observability/logger.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import { deliveryAttemptLogs } from '../schema/integratorPublicProduct.js';
import { getCurrentIntegratorTechnicalRuntimeRole } from '../withClient.js';
import { getOperationalVerboseLogEnabled } from './operationalVerboseLog.js';

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

/** PII-safe подмножество полей для warn/error (без сырого `payload`). */
function safeAttemptFields(params: DeliveryAttemptLogParams): Record<string, unknown> {
  return {
    intentType: asString(params.intentType),
    intentEventId: asString(params.intentEventId),
    correlationId: asString(params.correlationId),
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
  if (status !== 'success' && status !== 'failed') {
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
    const reason = asString(params.reason);
    const payloadJson =
      typeof params.payload === 'object' && params.payload !== null
        ? (params.payload as Record<string, unknown>)
        : {};
    const occurredAt = asString(params.occurredAt) ?? new Date().toISOString();
    const principal = getCurrentDbPrincipal();

    if (principal?.kind === 'infra' && principal.source === 'delivery-handler') {
      await runIntegratorSql(
        db,
        sql`SELECT app.record_global_email_delivery_attempt(
          ${intentType}, ${intentEventId}, ${correlationId}, ${channel}, ${status}, ${attempt}, ${reason}, ${payloadJson}::jsonb, ${occurredAt}::timestamptz
        )`,
      );
    } else if (getCurrentIntegratorTechnicalRuntimeRole() === 'app_operational_delivery_worker') {
      // A worker-drained send keeps its own `worker:*` principal all the way through the audit, so
      // it never took the delivery-handler branch above -- and that branch would reject it anyway,
      // because app.record_global_email_delivery_attempt hard-pins p_channel = 'email'. The direct
      // insert below then died with `42P01 relation "delivery_attempt_logs" does not exist`. The
      // cause is NAME RESOLUTION, not schema access: the Drizzle table is declared UNQUALIFIED
      // (schema/integratorPublicProduct.ts `pgTable('delivery_attempt_logs')`) while the row lives
      // in schema `integrator`, and the operational login's search_path is only "$user", public.
      // USAGE on `integrator` is in fact granted -- the schema was never the missing piece.
      await runIntegratorSql(
        db,
        sql`SELECT app.record_operational_delivery_attempt_audit(
          ${intentType}, ${intentEventId}, ${correlationId}, ${channel}, ${status}, ${attempt}, ${reason}, ${payloadJson}::jsonb, ${occurredAt}::timestamptz
        )`,
      );
    } else {
      const d = getIntegratorDrizzleSession(db);
      await d.insert(deliveryAttemptLogs).values({
        intentType,
        intentEventId,
        correlationId,
        channel,
        status,
        attempt,
        reason,
        payloadJson,
        occurredAt,
      });
    }
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
