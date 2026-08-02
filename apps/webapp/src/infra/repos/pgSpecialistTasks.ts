import { and, asc, desc, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import { specialistTasks } from '../../../db/schema/specialistTasks';
import { createPgOutgoingDeliveryQueueWritePort } from './pgOutgoingDeliveryQueue';
import type {
  CreateSpecialistTaskInput,
  SpecialistTasksPort,
  UpdateSpecialistTaskInput,
} from '@/modules/specialist-tasks/ports';
import { pickNextImportantOrOverdue } from '@/modules/specialist-tasks/taskPriority';
import type {
  SpecialistTaskPatientSummary,
  SpecialistTaskRow,
} from '@/modules/specialist-tasks/types';
import type { ReadyOutgoingDelivery } from '@/modules/messaging/outgoingDeliveryQueuePort';

type ReminderPreparation = (task: SpecialistTaskRow) => Promise<ReadyOutgoingDelivery[]>;
const queueWriter = createPgOutgoingDeliveryQueueWritePort();

function mapRow(row: typeof specialistTasks.$inferSelect): SpecialistTaskRow {
  return {
    id: row.id,
    organizationId: row.organizationId ?? null,
    ownerUserId: row.ownerUserId,
    patientUserId: row.patientUserId,
    title: row.title,
    description: row.description,
    dueAt: row.dueAt,
    remindAt: row.remindAt,
    isImportant: row.isImportant,
    completedAt: row.completedAt,
    reminderSentAt: row.reminderSentAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function currentWriteOrganizationId(...fallbacks: (string | null | undefined)[]): string | null {
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  const fallbackOrganizationIds = fallbacks.filter((x): x is string => Boolean(x));
  const fallbackOrganizationId = fallbackOrganizationIds[0] ?? null;
  const hasFallbackMismatch = fallbackOrganizationIds.some((id) => id !== fallbackOrganizationId);
  if (
    hasFallbackMismatch ||
    (principalOrganizationId &&
      fallbackOrganizationId &&
      principalOrganizationId !== fallbackOrganizationId)
  ) {
    throw new Error('organization_principal_mismatch');
  }
  return principalOrganizationId ?? fallbackOrganizationId;
}

export function createPgSpecialistTasksPort(
  prepareReminderDeliveries: ReminderPreparation = async () => [],
): SpecialistTasksPort {
  return {
    async listForOwner({ ownerUserId, patientUserId, includeCompleted = false, limit }) {
      const db = getDrizzle();
      const conditions = [eq(specialistTasks.ownerUserId, ownerUserId)];
      const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
      if (principalOrganizationId) {
        conditions.push(eq(specialistTasks.organizationId, principalOrganizationId));
      }
      if (patientUserId === null) {
        conditions.push(isNull(specialistTasks.patientUserId));
      } else if (patientUserId !== undefined) {
        conditions.push(eq(specialistTasks.patientUserId, patientUserId));
      }
      if (!includeCompleted) {
        conditions.push(isNull(specialistTasks.completedAt));
      }
      const base = db
        .select()
        .from(specialistTasks)
        .where(and(...conditions))
        .orderBy(
          desc(specialistTasks.isImportant),
          asc(specialistTasks.dueAt),
          desc(specialistTasks.createdAt),
        );
      const rows = limit != null && limit > 0 ? await base.limit(limit) : await base;
      return rows.map(mapRow);
    },

    async getByIdForOwner(taskId, ownerUserId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(specialistTasks)
        .where(and(eq(specialistTasks.id, taskId), eq(specialistTasks.ownerUserId, ownerUserId)))
        .limit(1);
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async create(input: CreateSpecialistTaskInput) {
      const now = new Date().toISOString();
      return runDrizzleMutationTransaction(async (tx) => {
        const inserted = await tx
          .insert(specialistTasks)
          .values({
            organizationId: currentWriteOrganizationId(),
            ownerUserId: input.ownerUserId,
            patientUserId: input.patientUserId,
            title: input.title,
            description: input.description ?? null,
            dueAt: input.dueAt ?? null,
            remindAt: input.remindAt ?? null,
            isImportant: input.isImportant ?? false,
            updatedAt: now,
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error('specialist_tasks insert failed');
        const task = mapRow(row);
        const deliveries = await prepareReminderDeliveries(task);
        for (const delivery of deliveries) await queueWriter.enqueueReady(tx, delivery);
        return task;
      });
    },

    async update(taskId, ownerUserId, patch: UpdateSpecialistTaskInput) {
      const now = new Date().toISOString();
      const set: Partial<typeof specialistTasks.$inferInsert> = { updatedAt: now };
      if (patch.title !== undefined) set.title = patch.title;
      if (patch.description !== undefined) set.description = patch.description;
      if (patch.dueAt !== undefined) set.dueAt = patch.dueAt;
      if (patch.remindAt !== undefined) {
        set.remindAt = patch.remindAt;
        if (patch.clearReminderSent) set.reminderSentAt = null;
      }
      if (patch.isImportant !== undefined) set.isImportant = patch.isImportant;

      return runDrizzleMutationTransaction(async (tx) => {
        const existing = await tx.query.specialistTasks.findFirst({
          where: and(eq(specialistTasks.id, taskId), eq(specialistTasks.ownerUserId, ownerUserId)),
        });
        if (!existing) return null;
        const updated = await tx
          .update(specialistTasks)
          .set({ ...set, organizationId: currentWriteOrganizationId(existing.organizationId) })
          .where(and(eq(specialistTasks.id, taskId), eq(specialistTasks.ownerUserId, ownerUserId)))
          .returning();
        const task = updated[0] ? mapRow(updated[0]) : null;
        if (!task) return null;
        const affectsIntent =
          patch.title !== undefined ||
          patch.description !== undefined ||
          patch.dueAt !== undefined ||
          patch.remindAt !== undefined;
        if (affectsIntent) {
          const deliveries = await prepareReminderDeliveries(task);
          for (const delivery of deliveries) await queueWriter.enqueueReady(tx, delivery);
          await queueWriter.terminalizeUnsentSpecialistTaskReminders(tx, {
            taskId,
            exceptEventIds: deliveries.map((delivery) => delivery.eventId),
            reason: 'SPECIALIST_TASK_REMINDER_SUPERSEDED',
          });
        }
        return task;
      });
    },

    async complete(taskId, ownerUserId) {
      const now = new Date().toISOString();
      return runDrizzleMutationTransaction(async (tx) => {
        const existing = await tx.query.specialistTasks.findFirst({
          where: and(eq(specialistTasks.id, taskId), eq(specialistTasks.ownerUserId, ownerUserId)),
        });
        if (!existing || existing.completedAt) return null;
        const updated = await tx
          .update(specialistTasks)
          .set({
            organizationId: currentWriteOrganizationId(existing.organizationId),
            completedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(specialistTasks.id, taskId),
              eq(specialistTasks.ownerUserId, ownerUserId),
              isNull(specialistTasks.completedAt),
            ),
          )
          .returning();
        await queueWriter.terminalizeUnsentSpecialistTaskReminders(tx, {
          taskId,
          reason: 'SPECIALIST_TASK_REMINDER_CANCELLED',
        });
        return updated[0] ? mapRow(updated[0]) : null;
      });
    },

    async delete(taskId, ownerUserId) {
      return runDrizzleMutationTransaction(async (tx) => {
        const existing = await tx.query.specialistTasks.findFirst({
          where: and(eq(specialistTasks.id, taskId), eq(specialistTasks.ownerUserId, ownerUserId)),
        });
        if (!existing) return false;
        currentWriteOrganizationId(existing.organizationId);
        await queueWriter.terminalizeUnsentSpecialistTaskReminders(tx, {
          taskId,
          reason: 'SPECIALIST_TASK_REMINDER_DELETED',
        });
        const deleted = await tx
          .delete(specialistTasks)
          .where(and(eq(specialistTasks.id, taskId), eq(specialistTasks.ownerUserId, ownerUserId)))
          .returning({ id: specialistTasks.id });
        return deleted.length > 0;
      });
    },

    async getPatientSummary(ownerUserId, patientUserId) {
      const open = await this.listForOwner({
        ownerUserId,
        patientUserId,
        includeCompleted: false,
      });
      const next = pickNextImportantOrOverdue(open);
      const summary: SpecialistTaskPatientSummary = {
        openCount: open.length,
        nextImportantOrOverdue: next
          ? { id: next.id, title: next.title, dueAt: next.dueAt, isImportant: next.isImportant }
          : null,
      };
      return summary;
    },

    async listDueReminders(nowIso, limit) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(specialistTasks)
        .where(
          and(
            isNull(specialistTasks.completedAt),
            isNotNull(specialistTasks.remindAt),
            lte(specialistTasks.remindAt, nowIso),
            isNull(specialistTasks.reminderSentAt),
          ),
        )
        .orderBy(asc(specialistTasks.remindAt))
        .limit(limit);
      return rows.map(mapRow);
    },

    async markReminderSent(taskId, sentAtIso) {
      await runDrizzleMutationTransaction(async (tx) => {
        const existing = await tx.query.specialistTasks.findFirst({
          where: eq(specialistTasks.id, taskId),
        });
        if (!existing) return;
        await tx
          .update(specialistTasks)
          .set({
            organizationId: currentWriteOrganizationId(existing.organizationId),
            reminderSentAt: sentAtIso,
            updatedAt: sentAtIso,
          })
          .where(and(eq(specialistTasks.id, taskId), isNull(specialistTasks.reminderSentAt)));
      });
    },

    async enqueueDueReminders(nowIso, limit) {
      const due = await this.listDueReminders(nowIso, limit);
      let enqueued = 0;
      for (const task of due) {
        await runDrizzleMutationTransaction(async (tx) => {
          const fresh = await tx.query.specialistTasks.findFirst({
            where: and(
              eq(specialistTasks.id, task.id),
              isNull(specialistTasks.completedAt),
              isNotNull(specialistTasks.remindAt),
            ),
          });
          if (!fresh) return;
          const deliveries = await prepareReminderDeliveries(mapRow(fresh));
          for (const delivery of deliveries) await queueWriter.enqueueReady(tx, delivery);
          enqueued += deliveries.length;
        });
      }
      return { processed: due.length, enqueued };
    },
  };
}
