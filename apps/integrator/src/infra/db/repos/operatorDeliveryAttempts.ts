import { sql } from 'drizzle-orm';
import type { DbPort, DbWriteMutation } from '../../../kernel/contracts/index.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

type OperatorAttemptParams = {
  intentEventId?: unknown;
  channel?: unknown;
  status?: unknown;
  attempt?: unknown;
  reason?: unknown;
};

export async function recordOperatorDeliveryAttempt(
  db: DbPort,
  mutation: DbWriteMutation,
): Promise<void> {
  if (mutation.type !== 'delivery.attempt.log') {
    throw new Error('Operational operator-attempt port accepts only delivery.attempt.log');
  }
  const params = mutation.params as OperatorAttemptParams;
  const eventId = typeof params.intentEventId === 'string' ? params.intentEventId : '';
  const channel = typeof params.channel === 'string' ? params.channel : '';
  const status = typeof params.status === 'string' ? params.status : '';
  const attempt =
    typeof params.attempt === 'number' && Number.isInteger(params.attempt) ? params.attempt : 0;
  const reason = typeof params.reason === 'string' ? params.reason : null;
  await runIntegratorSql(
    db,
    sql`SELECT app.record_operator_delivery_attempt(${eventId}, ${channel}, ${status}, ${attempt}, ${reason})`,
  );
}
