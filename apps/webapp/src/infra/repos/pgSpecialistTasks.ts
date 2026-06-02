import { and, asc, desc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { specialistTasks } from "../../../db/schema/specialistTasks";
import type {
  CreateSpecialistTaskInput,
  SpecialistTasksPort,
  UpdateSpecialistTaskInput,
} from "@/modules/specialist-tasks/ports";
import { pickNextImportantOrOverdue } from "@/modules/specialist-tasks/taskPriority";
import type { SpecialistTaskPatientSummary, SpecialistTaskRow } from "@/modules/specialist-tasks/types";

function mapRow(row: typeof specialistTasks.$inferSelect): SpecialistTaskRow {
  return {
    id: row.id,
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

export function createPgSpecialistTasksPort(): SpecialistTasksPort {
  return {
    async listForOwner({ ownerUserId, patientUserId, includeCompleted = false, limit }) {
      const db = getDrizzle();
      const conditions = [eq(specialistTasks.ownerUserId, ownerUserId)];
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
        .orderBy(desc(specialistTasks.isImportant), asc(specialistTasks.dueAt), desc(specialistTasks.createdAt));
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
      const db = getDrizzle();
      const now = new Date().toISOString();
      const inserted = await db
        .insert(specialistTasks)
        .values({
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
      if (!row) throw new Error("specialist_tasks insert failed");
      return mapRow(row);
    },

    async update(taskId, ownerUserId, patch: UpdateSpecialistTaskInput) {
      const db = getDrizzle();
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

      const updated = await db
        .update(specialistTasks)
        .set(set)
        .where(and(eq(specialistTasks.id, taskId), eq(specialistTasks.ownerUserId, ownerUserId)))
        .returning();
      return updated[0] ? mapRow(updated[0]) : null;
    },

    async complete(taskId, ownerUserId) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const updated = await db
        .update(specialistTasks)
        .set({ completedAt: now, updatedAt: now })
        .where(
          and(
            eq(specialistTasks.id, taskId),
            eq(specialistTasks.ownerUserId, ownerUserId),
            isNull(specialistTasks.completedAt),
          ),
        )
        .returning();
      return updated[0] ? mapRow(updated[0]) : null;
    },

    async delete(taskId, ownerUserId) {
      const db = getDrizzle();
      const deleted = await db
        .delete(specialistTasks)
        .where(and(eq(specialistTasks.id, taskId), eq(specialistTasks.ownerUserId, ownerUserId)))
        .returning({ id: specialistTasks.id });
      return deleted.length > 0;
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
      const db = getDrizzle();
      await db
        .update(specialistTasks)
        .set({ reminderSentAt: sentAtIso, updatedAt: sentAtIso })
        .where(and(eq(specialistTasks.id, taskId), isNull(specialistTasks.reminderSentAt)));
    },
  };
}
