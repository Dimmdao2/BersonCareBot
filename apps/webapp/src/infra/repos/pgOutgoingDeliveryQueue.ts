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
  return {
    organizationId: delivery.organizationId,
    eventId: delivery.eventId,
    kind: delivery.kind,
    channel: delivery.channel,
    payloadJson: { intent: delivery.intent },
    status: 'pending',
    attemptCount: 0,
    maxAttempts: 6,
    nextRetryAt: delivery.nextRetryAt,
    lastError: null,
    deadAt: null,
  };
}

/** Replaces only a not-yet-sent intent. A sent/dead row remains immutable evidence. */
export function createPgOutgoingDeliveryQueueWritePort(): OutgoingDeliveryQueueWritePort<DrizzleDb> {
  return {
    async enqueueReady(tx: DrizzleDb, delivery: ReadyOutgoingDelivery): Promise<void> {
      const values = queueValues(delivery);
      await tx
        .insert(outgoingDeliveryQueue)
        .values(values)
        .onConflictDoUpdate({
          target: outgoingDeliveryQueue.eventId,
          set: {
            organizationId: values.organizationId,
            payloadJson: values.payloadJson,
            status: values.status,
            attemptCount: values.attemptCount,
            nextRetryAt: values.nextRetryAt,
            lastError: null,
            deadAt: null,
            updatedAt: sql`now()`,
          },
          where: inArray(outgoingDeliveryQueue.status, [...REPLACEABLE_STATUSES]),
        });
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
  };
}
