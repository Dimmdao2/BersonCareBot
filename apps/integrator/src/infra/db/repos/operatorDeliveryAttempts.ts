import { sql } from 'drizzle-orm';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import type { DbPort, DbWriteMutation } from '../../../kernel/contracts/index.js';
import { runWithInfraPrincipal } from '../../principal/organizationPrincipal.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';

type OperatorAttemptParams = {
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

const OUTGOING_DELIVERY_WORKER_SOURCE = 'worker:outgoing-delivery-tick';

export async function recordOperatorDeliveryAttempt(
  db: DbPort,
  mutation: DbWriteMutation,
): Promise<void> {
  if (mutation.type !== 'delivery.attempt.log') {
    throw new Error('Operational operator-attempt port accepts only delivery.attempt.log');
  }
  const params = mutation.params as OperatorAttemptParams;
  const intentType = typeof params.intentType === 'string' ? params.intentType : null;
  const eventId = typeof params.intentEventId === 'string' ? params.intentEventId : '';
  const correlationId = typeof params.correlationId === 'string' ? params.correlationId : null;
  const organizationId = typeof params.organizationId === 'string' ? params.organizationId : null;
  const channel = typeof params.channel === 'string' ? params.channel : '';
  const status = typeof params.status === 'string' ? params.status : '';
  const attempt =
    typeof params.attempt === 'number' && Number.isInteger(params.attempt) ? params.attempt : 0;
  const reason = typeof params.reason === 'string' ? params.reason : null;
  const payloadText = JSON.stringify(
    typeof params.payload === 'object' && params.payload !== null ? params.payload : {},
  );
  const occurredAt =
    typeof params.occurredAt === 'string' ? params.occurredAt : new Date().toISOString();
  const functionArgs = [
    intentType,
    eventId,
    correlationId,
    organizationId,
    channel,
    status,
    attempt,
    reason,
    payloadText,
    occurredAt,
  ] as const;
  // Идентичность корня стоит ЛИТЕРАЛОМ прямо в вызове, а не в константе выше: сторож
  // `port-context-callsite-catalog.test.mjs` сверяет каталог capability с местами вызова, читая
  // аргумент статически. Константа прячет идентичность от сверки, и расхождение каталога с кодом
  // становится невидимым до первого живого отказа принципала.
  await runIntegratorNamedRoot(
    db,
    'app.record_operator_delivery_attempt(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)',
    functionArgs,
    sql`SELECT app.record_operator_delivery_attempt(
      ${intentType}, ${eventId}, ${correlationId}, ${organizationId}::uuid, ${channel}, ${status},
      ${attempt}, ${reason}, ${payloadText}, ${occurredAt}::timestamptz
    )`,
  );
}

/**
 * Runs the canonical delivery-attempt root under the capability principal that owns it.
 * This is deliberately shared by all producers: an attempt need not have an
 * outgoing_delivery_queue row to belong in the operator journal.
 */
export async function writeOperatorDeliveryAttempt(
  db: DbPort,
  mutation: DbWriteMutation,
): Promise<void> {
  const principal = getCurrentDbPrincipal();
  if (principal?.kind === 'infra' && principal.source === OUTGOING_DELIVERY_WORKER_SOURCE) {
    await recordOperatorDeliveryAttempt(db, mutation);
    return;
  }
  await runWithInfraPrincipal({ source: OUTGOING_DELIVERY_WORKER_SOURCE }, () =>
    recordOperatorDeliveryAttempt(db, mutation),
  );
}
