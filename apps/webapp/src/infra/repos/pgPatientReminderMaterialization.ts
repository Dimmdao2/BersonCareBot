import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { reminderRules, userReminderOccurrences } from '../../../db/schema/schema';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import type {
  PatientReminderMaterializationPort,
  PatientReminderRuleForMaterialization,
} from '@/modules/reminders/patientReminderMaterializationPort';
import { createPgOutgoingDeliveryQueueWritePort } from './pgOutgoingDeliveryQueue';
import { getDrizzle } from '@/app-layer/db/drizzle';

const queueWriter = createPgOutgoingDeliveryQueueWritePort();

function mapRule(row: typeof reminderRules.$inferSelect): PatientReminderRuleForMaterialization {
  if (!row.organizationId || !row.platformUserId) {
    throw new Error('patient_reminder_rule_missing_canonical_scope');
  }
  return {
    id: row.integratorRuleId,
    organizationId: row.organizationId,
    platformUserId: row.platformUserId,
    integratorUserId: row.integratorUserId === null ? null : String(row.integratorUserId),
    category: row.category,
    isEnabled: row.isEnabled,
    scheduleType: row.scheduleType,
    timezone: row.timezone,
    intervalMinutes: row.intervalMinutes,
    windowStartMinute: row.windowStartMinute,
    windowEndMinute: row.windowEndMinute,
    daysMask: row.daysMask,
    scheduleData: row.scheduleData,
    quietHoursStartMinute: row.quietHoursStartMinute,
    quietHoursEndMinute: row.quietHoursEndMinute,
    linkedObjectType: row.linkedObjectType,
    linkedObjectId: row.linkedObjectId,
    customTitle: row.customTitle,
    customText: row.customText,
    displayTitle: row.displayTitle,
    reminderIntent: row.reminderIntent,
    notificationTopicCode: row.notificationTopicCode,
  };
}

export function createPgPatientReminderMaterializationPort(): PatientReminderMaterializationPort {
  return {
    async listEnabledRules(organizationId) {
      const rows = await getDrizzle()
        .select()
        .from(reminderRules)
        .where(
          and(eq(reminderRules.organizationId, organizationId), eq(reminderRules.isEnabled, true)),
        );
      return rows.map(mapRule);
    },

    async materializeOccurrence(rule, draft, prepare) {
      const generatedId = randomUUID();
      return runDrizzleMutationTransaction(async (tx) => {
        const upsert = await tx.execute(sql`
          SELECT * FROM app.upsert_patient_reminder_occurrence_plan(
            ${generatedId}, ${rule.id}, ${rule.organizationId}::uuid,
            ${rule.platformUserId}::uuid, ${draft.occurrenceKey}, ${draft.plannedAt}::timestamptz
          )
        `);
        const row = upsert.rows[0] as
          | { occurrence_id?: string; delivery_generation?: number; materializable?: boolean }
          | undefined;
        if (!row?.materializable || !row.occurrence_id) return 'not_actionable';
        const occurrence = {
          id: row.occurrence_id,
          deliveryGeneration: Number(row.delivery_generation ?? 0),
          plannedAt: draft.plannedAt,
        };
        const deliveries = await prepare(occurrence);
        if (deliveries.length === 0) {
          throw new NoPatientReminderChannelsError();
        }
        let inserted = 0;
        for (const delivery of deliveries) {
          if (await queueWriter.enqueueReady(tx, delivery)) inserted += 1;
        }
        const eventIds = deliveries.map((delivery) => delivery.eventId);
        const marked = await tx.execute(sql`
          SELECT app.mark_patient_reminder_occurrence_queued(
            ${occurrence.id}, ${occurrence.deliveryGeneration}, ${eventIds}::text[]
          ) AS marked
        `);
        if ((marked.rows[0] as { marked?: boolean } | undefined)?.marked !== true) {
          throw new Error('patient_reminder_occurrence_queue_mark_failed');
        }
        return inserted > 0 ? 'materialized' : 'dedup';
      }).catch((error: unknown) => {
        if (error instanceof NoPatientReminderChannelsError) return 'no_channels' as const;
        throw error;
      });
    },
  };
}

class NoPatientReminderChannelsError extends Error {}
