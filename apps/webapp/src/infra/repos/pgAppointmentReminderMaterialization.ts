import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type { AppointmentReminderReadyOutgoingDelivery } from '@/modules/messaging/outgoingDeliveryQueuePort';
import type { AppointmentReminderMaterializationPort } from '@/modules/booking-notifications/appointmentReminderMaterializationPort';

/**
 * Продуктовая форма строки очереди остаётся здесь, а не уезжает в SQL: тексты, лестница мессенджеров
 * и сроки — решение вебаппа, корень кладёт их в `payload_json` дословно.
 */
export function appointmentReminderQueueRow(
  delivery: AppointmentReminderReadyOutgoingDelivery,
): Record<string, unknown> {
  return {
    eventId: delivery.eventId,
    channel: delivery.channel,
    payloadJson: {
      intent: delivery.intent,
      appointmentId: delivery.appointmentId,
      generationStartAt: delivery.generationStartAt,
      dueAt: delivery.dueAt,
      ...(delivery.messengerLadder
        ? { messengerLadder: delivery.messengerLadder, messengerStepIndex: 0 }
        : {}),
    },
    maxAttempts: delivery.messengerLadder?.length ?? 1,
    nextRetryAt: delivery.nextRetryAt,
  };
}

/**
 * Одно обращение к базе на замену поколения: единственный объявленный корень, никакого DML по
 * `public.outgoing_delivery_queue`. Раньше здесь стоял прямой drizzle-инсерт, а INSERT на эту
 * таблицу не выдан ни одной рабочей роли — поэтому строк вида `appointment_reminder` в очереди не
 * появлялось НИКОГДА. Строку пишет владелец шва `app_seam_reminder_materialization_owner`;
 * `app_tenant_service` имеет только EXECUTE.
 */
export function createPgAppointmentReminderMaterializationPort(): AppointmentReminderMaterializationPort {
  return {
    async replaceGeneration(input) {
      const deliveriesJson = JSON.stringify(input.deliveries.map(appointmentReminderQueueRow));
      const args = [
        input.organizationId,
        input.appointmentId,
        input.generationStartAt,
        deliveriesJson,
        input.reason,
      ];
      const result = await runWebappNamedRoot<{
        generation: { current?: boolean; inserted?: number } | null;
      }>(
        getWebappSqlDb(),
        'app.replace_appointment_reminder_generation(uuid,uuid,timestamp with time zone,text,text)',
        args,
        sql`SELECT app.replace_appointment_reminder_generation(
          ${input.organizationId}::uuid,
          ${input.appointmentId}::uuid,
          ${input.generationStartAt}::timestamptz,
          ${deliveriesJson}::text,
          ${input.reason}::text
        ) AS generation`,
      );
      const generation = result.rows[0]?.generation;
      if (!generation) throw new Error('appointment_reminder_generation_root_returned_nothing');
      return { current: generation.current === true, inserted: Number(generation.inserted ?? 0) };
    },
  };
}
