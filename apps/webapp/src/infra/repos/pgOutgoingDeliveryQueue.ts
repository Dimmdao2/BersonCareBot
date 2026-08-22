import { sql } from 'drizzle-orm';
import { runWebappSql } from '@/infra/db/runWebappSql';
import type {
  OutgoingDeliveryQueueWritePort,
  SpecialistTaskReadyOutgoingDelivery,
} from '@/modules/messaging/outgoingDeliveryQueuePort';
import type { DrizzleDb } from '@/app-layer/db/drizzle';

/** Product decision, not a worker-derived ladder: six attempts per specialist-task reminder. */
const SPECIALIST_TASK_REMINDER_MAX_ATTEMPTS = 6;

/** One entry of the generation transcript the declared root parses back out of `p_deliveries`. */
function queueEntry(delivery: SpecialistTaskReadyOutgoingDelivery) {
  const botMarkerRequired = delivery.channel === 'telegram' || delivery.channel === 'max';
  return {
    eventId: delivery.eventId,
    channel: delivery.channel,
    payloadJson: {
      intent: delivery.intent,
      successOutcome: delivery.successOutcome,
      ...(botMarkerRequired ? { bookkeeping: { botMarkerRequired: true } } : {}),
    },
    maxAttempts: SPECIALIST_TASK_REMINDER_MAX_ATTEMPTS,
    nextRetryAt: delivery.nextRetryAt,
  };
}

/**
 * Единственный писатель `public.outgoing_delivery_queue` со стороны вебаппа — объявленный корень
 * `app.replace_specialist_task_reminder_generation` (миграция 20260822T121000). Роли рантайма
 * (`app_patient`, `app_staff`) имеют на очереди ровно НОЛЬ грантов: строку пишет владелец шва
 * `app_seam_reminder_specialist_owner`, уже покрытый политикой `rev10_named_root_owner_gate_134`.
 * До этого корня снятие и постановка шли реляционным DML под `app_staff` и отвечали
 * `42501 permission denied for table outgoing_delivery_queue` — кнопка «Выполнить» у задачи врача
 * возвращала 500, а напоминания по задачам не ставились ни разу.
 *
 * Варианты вызова — параметры ОДНОЙ точки, а не отдельные двери: создание задачи даёт непустой
 * список без прошлого поколения, правка — непустой список и снятие лишнего, завершение и удаление
 * — пустой список. Второго пути к строке очереди не существует.
 *
 * Второй аргумент корня — `text`, а не `jsonb`: та же причина, что у соседей
 * `app.replace_appointment_reminder_generation` и `app.enqueue_outbound_message`.
 *
 * Корень зовётся ВНУТРИ уже открытой транзакции задачи (её запись и снятие её напоминаний обязаны
 * быть одним фактом), поэтому его гейт — attested, и он не проходит через `runWebappNamedRoot`,
 * который по построению начинается ДО транзакции.
 */
export function createPgOutgoingDeliveryQueueWritePort(): OutgoingDeliveryQueueWritePort<DrizzleDb> {
  return {
    async replaceSpecialistTaskReminderGeneration(tx, input): Promise<string[]> {
      const deliveriesJson = JSON.stringify(input.deliveries.map(queueEntry));
      const result = await runWebappSql<{ result: { writtenEventIds?: unknown } | null }>(
        tx,
        sql`SELECT app.replace_specialist_task_reminder_generation(
          ${input.taskId}::uuid, ${deliveriesJson}::text, ${input.reason}::text
        ) AS result`,
      );
      const written = result.rows[0]?.result?.writtenEventIds;
      if (!Array.isArray(written)) {
        throw new Error('specialist_task_reminder_generation_invalid');
      }
      const writtenEventIds = written as string[];
      // Отпечаток материализации ставит соседняя дверь того же шва: она уже объявлена, уже
      // исполняема `app_staff` и владеет вычислением отпечатка. Строка без отпечатка не должна
      // существовать — воркер доставки сверяет его перед отправкой, — поэтому отказ здесь роняет
      // всю транзакцию задачи, как и до перевода постановки на объявленный корень.
      for (const eventId of writtenEventIds) {
        const refreshed = await runWebappSql<{ refreshed: boolean | null }>(
          tx,
          sql`SELECT app.refresh_specialist_task_reminder_materialization(${eventId}) AS refreshed`,
        );
        if (refreshed.rows[0]?.refreshed !== true) {
          throw new Error('specialist_task_reminder_materialization_refresh_failed');
        }
      }
      return writtenEventIds;
    },
  };
}
