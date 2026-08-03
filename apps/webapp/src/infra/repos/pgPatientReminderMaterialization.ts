import { randomUUID } from 'node:crypto';
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import {
  contentPages,
  contentSections,
  reminderRules,
  userReminderOccurrences,
} from '../../../db/schema/schema';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import type {
  PatientReminderMaterializationPort,
  PatientReminderRuleForMaterialization,
} from '@/modules/reminders/patientReminderMaterializationPort';
import { createPgOutgoingDeliveryQueueWritePort } from './pgOutgoingDeliveryQueue';
import { getDrizzle } from '@/app-layer/db/drizzle';
import type { OutgoingDeliveryQueueWritePort } from '@/modules/messaging/outgoingDeliveryQueuePort';
import type { DrizzleDb } from '@/app-layer/db/drizzle';

type PatientReminderMaterializationDependencies = {
  queueWriter?: Pick<OutgoingDeliveryQueueWritePort<DrizzleDb>, 'enqueueReady'>;
};

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

export function createPgPatientReminderMaterializationPort(
  dependencies: PatientReminderMaterializationDependencies = {},
): PatientReminderMaterializationPort {
  const queueWriter = dependencies.queueWriter ?? createPgOutgoingDeliveryQueueWritePort();
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

    async listDuePlannedOccurrences(organizationId, nowIso) {
      const rows = await getDrizzle()
        .select({
          ruleId: userReminderOccurrences.ruleId,
          occurrenceKey: userReminderOccurrences.occurrenceKey,
          plannedAt: userReminderOccurrences.plannedAt,
        })
        .from(userReminderOccurrences)
        .innerJoin(
          reminderRules,
          and(
            eq(reminderRules.integratorRuleId, userReminderOccurrences.ruleId),
            eq(reminderRules.organizationId, userReminderOccurrences.organizationId),
            eq(reminderRules.platformUserId, userReminderOccurrences.platformUserId),
          ),
        )
        .where(
          and(
            eq(userReminderOccurrences.organizationId, organizationId),
            eq(userReminderOccurrences.status, 'planned'),
            lte(userReminderOccurrences.plannedAt, nowIso),
            eq(reminderRules.isEnabled, true),
          ),
        )
        .limit(100);
      return rows.map((row) => ({
        ruleId: row.ruleId,
        draft: { occurrenceKey: row.occurrenceKey, plannedAt: row.plannedAt },
      }));
    },

    async resolveLinkedTitle(rule) {
      const linkedObjectId = rule.linkedObjectId?.trim();
      if (!linkedObjectId) return null;
      if (rule.linkedObjectType === 'content_page') {
        const rows = await getDrizzle()
          .select({ title: contentPages.title })
          .from(contentPages)
          .where(
            and(
              eq(contentPages.slug, linkedObjectId),
              eq(contentPages.isPublished, true),
              isNull(contentPages.deletedAt),
            ),
          )
          .limit(1);
        return rows[0]?.title.trim() || null;
      }
      if (rule.linkedObjectType === 'content_section') {
        const rows = await getDrizzle()
          .select({ title: contentSections.title })
          .from(contentSections)
          .where(eq(contentSections.slug, linkedObjectId))
          .limit(1);
        return rows[0]?.title.trim() || null;
      }
      return null;
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
