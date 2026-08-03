import { and, eq, inArray, isNull } from 'drizzle-orm';
import { beAppointments } from '../../../db/schema/bookingEngine';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import { createPgOutgoingDeliveryQueueWritePort } from '@/infra/repos/pgOutgoingDeliveryQueue';
import type { AppointmentReminderMaterializationPort } from '@/modules/booking-notifications/appointmentReminderMaterializationPort';

const ACTIVE_APPOINTMENT_STATUSES = [
  'created',
  'awaiting_payment',
  'paid',
  'confirmed',
  'rescheduled',
  'visit_confirmed',
  'charged_to_package',
] as const;

export function createPgAppointmentReminderMaterializationPort(): AppointmentReminderMaterializationPort {
  const queue = createPgOutgoingDeliveryQueueWritePort();
  return {
    async replaceGeneration(input) {
      return runDrizzleMutationTransaction(async (tx) => {
        const rows = await tx
          .select({ id: beAppointments.id })
          .from(beAppointments)
          .where(
            and(
              eq(beAppointments.id, input.appointmentId),
              eq(beAppointments.organizationId, input.organizationId),
              eq(beAppointments.startAt, input.generationStartAt),
              inArray(beAppointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
              isNull(beAppointments.deletedAt),
            ),
          )
          .limit(1);
        const eventIds = input.deliveries.map((delivery) => delivery.eventId);
        await queue.terminalizeUnsentAppointmentReminders(tx, {
          appointmentId: input.appointmentId,
          exceptEventIds: eventIds,
          reason: input.reason,
        });
        if (rows.length === 0) return { current: false, inserted: 0 };
        let inserted = 0;
        for (const delivery of input.deliveries) {
          if (await queue.enqueueReady(tx, delivery)) inserted += 1;
        }
        return { current: true, inserted };
      });
    },
  };
}
