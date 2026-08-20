import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import {
  DEFAULT_OUTBOUND_MESSAGE_MAX_ATTEMPTS,
  type OutboundMessageContext,
  type OutboundMessageQueuePort,
} from '@/modules/messaging/outboundMessageQueuePort';

/**
 * Одно обращение к базе на постановку: единственный объявленный корень, никакого DML по таблице.
 * Роли рантайма (`app_patient`, `app_staff`) имеют на `public.outgoing_delivery_queue` ровно
 * НОЛЬ грантов — только EXECUTE на этот корень; строку пишет владелец шва
 * `app_seam_delivery_scope_owner`, уже покрытый политикой `rev10_named_root_owner_gate_136`.
 *
 * Шестой аргумент корня — `text`, а не `jsonb` (миграция 0036): порт-аргумент входит в подписанный
 * транскрипт вызова, а `jsonb_send` отдаёт каноническое представление PostgreSQL, которое клиент не
 * может воспроизвести байт в байт. `contentJson` уходит как текст и разбирается `::jsonb` внутри
 * тела корня — та же форма, что у соседнего `app.replace_appointment_reminder_generation`.
 */
export function createPgOutboundMessageQueue(): OutboundMessageQueuePort {
  return {
    async enqueue(context: OutboundMessageContext): Promise<boolean> {
      const contentJson = JSON.stringify(context.content);
      const maxAttempts = context.maxAttempts ?? DEFAULT_OUTBOUND_MESSAGE_MAX_ATTEMPTS;
      const args = [
        context.organizationId,
        context.purpose,
        context.idempotencyKey,
        context.channel,
        context.recipient,
        contentJson,
        maxAttempts,
      ];
      const result = await runWebappNamedRoot<{ enqueued: boolean | null }>(
        getWebappSqlDb(),
        'app.enqueue_outbound_message(uuid,text,text,text,text,text,integer)',
        args,
        sql`SELECT app.enqueue_outbound_message(
          ${context.organizationId}::uuid,
          ${context.purpose}::text,
          ${context.idempotencyKey}::text,
          ${context.channel}::text,
          ${context.recipient}::text,
          ${contentJson}::text,
          ${maxAttempts}::integer
        ) AS enqueued`,
      );
      return result.rows[0]?.enqueued === true;
    },
  };
}
