import { and, eq, inArray, like, notInArray, sql } from 'drizzle-orm';
import { outgoingDeliveryQueue } from '../../../db/schema/outgoingDeliveryQueue';
import type {
  OutgoingDeliveryQueueWritePort,
  ReadyOutgoingDelivery,
} from '@/modules/messaging/outgoingDeliveryQueuePort';
import type { DrizzleDb } from '@/app-layer/db/drizzle';

const REPLACEABLE_STATUSES = ['pending', 'failed_retryable'] as const;
const TERMINALIZABLE_STATUSES = [...REPLACEABLE_STATUSES, 'processing'] as const;

function queueValues(delivery: ReadyOutgoingDelivery) {
  const botMarkerRequired = delivery.channel === 'telegram' || delivery.channel === 'max';
  const specialist = delivery.kind === 'specialist_task_reminder';
  const reminder = delivery.kind === 'reminder_dispatch';
  const appointment = delivery.kind === 'appointment_reminder';
  return {
    organizationId: delivery.organizationId,
    eventId: delivery.eventId,
    kind: delivery.kind,
    channel: delivery.channel,
    payloadJson: {
      ...(reminder
        ? {
            occurrenceId: delivery.occurrenceId,
            deliveryGeneration: delivery.deliveryGeneration,
            topicCode: delivery.topicCode,
            channel: delivery.channel,
            deliveryLogId: `rdl:${delivery.occurrenceId}:g${delivery.deliveryGeneration}:${delivery.channel}`,
            externalId: delivery.externalId,
            logText: delivery.logText,
            platformUserId: delivery.platformUserId,
          }
        : {}),
      intent: delivery.intent,
      ...(specialist ? { successOutcome: delivery.successOutcome } : {}),
      ...(appointment
        ? {
            appointmentId: delivery.appointmentId,
            generationStartAt: delivery.generationStartAt,
            dueAt: delivery.dueAt,
            ...(delivery.messengerLadder
              ? { messengerLadder: delivery.messengerLadder, messengerStepIndex: 0 }
              : {}),
          }
        : {}),
      ...(specialist && botMarkerRequired ? { bookkeeping: { botMarkerRequired: true } } : {}),
    },
    status: 'pending',
    attemptCount: 0,
    maxAttempts: specialist
      ? 6
      : appointment
        ? (delivery.messengerLadder?.length ?? 1)
        : delivery.maxAttempts,
    nextRetryAt: delivery.nextRetryAt,
    lastError: null,
    deadAt: null,
    priority: delivery.kind === 'auth_email_otp' ? delivery.priority : 0,
  };
}

/** Replaces only a not-yet-sent intent. A sent/dead row remains immutable evidence. */
export function createPgOutgoingDeliveryQueueWritePort(): OutgoingDeliveryQueueWritePort<DrizzleDb> {
  return {
    async enqueueReady(tx: DrizzleDb, delivery: ReadyOutgoingDelivery): Promise<boolean> {
      const values = queueValues(delivery);
      // Episodic, standalone jobs (not replaceable-in-place): a repeated eventId is idempotency,
      // never a refresh. auth_email_otp mints a fresh eventId per OTP issuance (see
      // pgAuthEmailOtpDeliveryQueue.ts), so a conflict here only means a genuine retry of the same
      // enqueue call, never a newer intent that should overwrite an older one.
      if (delivery.kind === 'operator_health_digest' || delivery.kind === 'auth_email_otp') {
        const inserted = await tx
          .insert(outgoingDeliveryQueue)
          .values(values)
          .onConflictDoNothing({ target: outgoingDeliveryQueue.eventId })
          .returning({ eventId: outgoingDeliveryQueue.eventId });
        return inserted.length > 0;
      }
      const refreshedRows = await tx
        .insert(outgoingDeliveryQueue)
        .values(values)
        .onConflictDoUpdate({
          target: outgoingDeliveryQueue.eventId,
          set: {
            organizationId: values.organizationId,
            kind: values.kind,
            channel: values.channel,
            payloadJson: values.payloadJson,
            status: values.status,
            attemptCount: values.attemptCount,
            maxAttempts: values.maxAttempts,
            nextRetryAt: values.nextRetryAt,
            lastError: null,
            deadAt: null,
            updatedAt: sql`now()`,
          },
          where: inArray(outgoingDeliveryQueue.status, [...REPLACEABLE_STATUSES]),
        })
        .returning({ eventId: outgoingDeliveryQueue.eventId });
      if (refreshedRows.length === 0) return false;
      if (delivery.kind === 'specialist_task_reminder') {
        const result = await tx.execute(
          sql`SELECT app.refresh_specialist_task_reminder_materialization(${delivery.eventId}) AS refreshed`,
        );
        const row = result.rows[0] as { refreshed?: boolean } | undefined;
        if (row?.refreshed !== true) {
          throw new Error('specialist_task_reminder_materialization_refresh_failed');
        }
      }
      return true;
    },

    async terminalizeUnsentSpecialistTaskReminders(tx, input): Promise<void> {
      const predicates = [
        eq(outgoingDeliveryQueue.kind, 'specialist_task_reminder'),
        like(outgoingDeliveryQueue.eventId, `specialist-task:${input.taskId}:%`),
        inArray(outgoingDeliveryQueue.status, [...TERMINALIZABLE_STATUSES]),
      ];
      if (input.exceptEventIds && input.exceptEventIds.length > 0) {
        predicates.push(notInArray(outgoingDeliveryQueue.eventId, [...input.exceptEventIds]));
      }
      await tx
        .update(outgoingDeliveryQueue)
        .set({ status: 'dead', deadAt: sql`now()`, lastError: input.reason, updatedAt: sql`now()` })
        .where(and(...predicates));
    },

    async terminalizeUnsentAppointmentReminders(tx, input): Promise<void> {
      const predicates = [
        eq(outgoingDeliveryQueue.kind, 'appointment_reminder'),
        sql`${outgoingDeliveryQueue.payloadJson}->>'appointmentId' = ${input.appointmentId}`,
        inArray(outgoingDeliveryQueue.status, [...TERMINALIZABLE_STATUSES]),
      ];
      if (input.exceptEventIds && input.exceptEventIds.length > 0) {
        predicates.push(notInArray(outgoingDeliveryQueue.eventId, [...input.exceptEventIds]));
      }
      await tx
        .update(outgoingDeliveryQueue)
        .set({ status: 'dead', deadAt: sql`now()`, lastError: input.reason, updatedAt: sql`now()` })
        .where(and(...predicates));
    },
  };
}
