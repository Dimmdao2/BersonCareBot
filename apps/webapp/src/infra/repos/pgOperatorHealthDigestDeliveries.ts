import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import { nullableToIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import type { OperatorHealthDigestReadyOutgoingDelivery } from '@/modules/messaging/outgoingDeliveryQueuePort';
import { createPgOutgoingDeliveryQueueWritePort } from './pgOutgoingDeliveryQueue';

const queue = createPgOutgoingDeliveryQueueWritePort();

export async function enqueueOperatorHealthDigestDeliveries(
  deliveries: readonly OperatorHealthDigestReadyOutgoingDelivery[],
): Promise<number> {
  return runDrizzleMutationTransaction(async (tx) => {
    let inserted = 0;
    for (const delivery of deliveries) {
      if (await queue.enqueueReady(tx, delivery)) inserted += 1;
    }
    return inserted;
  });
}

/**
 * Начало окна суточной сводки — время ПОДТВЕРЖДЁННОЙ отправки прошлой сводки.
 *
 * Читается объявленным корнем, а не отношением: на `public.outgoing_delivery_queue` у `app_staff`
 * нет ни одной привилегии и по решению не должно быть, поэтому прямой SELECT отвечал 42501 и ронял
 * весь тик сводки на первом же шаге (`reminder-materialization-declaration.test.mjs` держит это
 * решение: «runtime roles cannot bypass ... the queue root»).
 */
export async function loadLatestSentOperatorHealthDigestAt(): Promise<string | null> {
  const result = await runWebappNamedRoot<{ last_sent_at: string | null }>(
    getWebappSqlDb(),
    'app.read_operator_health_digest_last_sent_at()',
    [],
    sql`SELECT app.read_operator_health_digest_last_sent_at() AS last_sent_at`,
  );
  return nullableToIsoStringSafe(result.rows[0]?.last_sent_at ?? null);
}
