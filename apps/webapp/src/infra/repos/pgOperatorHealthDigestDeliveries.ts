import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import { nullableToIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import type { OperatorHealthDigestReadyOutgoingDelivery } from '@/modules/messaging/outgoingDeliveryQueuePort';

/**
 * Постановка суточной сводки в очередь — объявленным корнем, а не прямым INSERT.
 *
 * До миграции 0039 это шло через `pgOutgoingDeliveryQueue.enqueueReady` прямым INSERT под
 * `app_staff`, у которого на `public.outgoing_delivery_queue` нет ни одной привилегии: строк
 * `kind='operator_health_digest'` не появлялось вовсе, сводка не уходила НИ РАЗУ.
 *
 * Каждая строка ставится СВОИМ вызовом корня и вне общей транзакции: корень идемпотентен по
 * `event_id` (`ON CONFLICT DO NOTHING`), поэтому повтор тика доигрывает недоставленное и не
 * рождает второй строки. Общая транзакция здесь и невозможна — объявленный корень обязан
 * начинаться ДО транзакции отношений (`runWebappNamedRoot`).
 */
export async function enqueueOperatorHealthDigestDeliveries(
  deliveries: readonly OperatorHealthDigestReadyOutgoingDelivery[],
): Promise<number> {
  let inserted = 0;
  for (const delivery of deliveries) {
    const payloadJson = JSON.stringify({ intent: delivery.intent });
    const args = [
      delivery.eventId,
      delivery.channel,
      payloadJson,
      delivery.maxAttempts,
    ] as const;
    const result = await runWebappNamedRoot<{ inserted: boolean }>(
      getWebappSqlDb(),
      'app.enqueue_operator_health_digest_delivery(text,text,text,integer)',
      args,
      sql`SELECT app.enqueue_operator_health_digest_delivery(
        ${sql.param(args[0])}::text,
        ${sql.param(args[1])}::text,
        ${sql.param(args[2])}::text,
        ${sql.param(args[3])}::integer
      ) AS inserted`,
    );
    if (result.rows[0]?.inserted === true) inserted += 1;
  }
  return inserted;
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
