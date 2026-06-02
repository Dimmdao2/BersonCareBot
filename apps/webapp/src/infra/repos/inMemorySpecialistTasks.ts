import type { SpecialistTasksPort } from "@/modules/specialist-tasks/ports";
import type { SpecialistTaskRow } from "@/modules/specialist-tasks/types";
import { pickNextImportantOrOverdue } from "@/modules/specialist-tasks/taskPriority";

const store: SpecialistTaskRow[] = [];

export const inMemorySpecialistTasksPort: SpecialistTasksPort = {
  async listForOwner({ ownerUserId, patientUserId, includeCompleted, limit }) {
    let rows = store.filter((t) => t.ownerUserId === ownerUserId);
    if (patientUserId === null) rows = rows.filter((t) => t.patientUserId === null);
    else if (patientUserId !== undefined) rows = rows.filter((t) => t.patientUserId === patientUserId);
    if (!includeCompleted) rows = rows.filter((t) => !t.completedAt);
    if (limit != null && limit > 0) rows = rows.slice(0, limit);
    return rows;
  },

  async getByIdForOwner(taskId, ownerUserId) {
    return store.find((t) => t.id === taskId && t.ownerUserId === ownerUserId) ?? null;
  },

  async create(input) {
    const now = new Date().toISOString();
    const row: SpecialistTaskRow = {
      id: crypto.randomUUID(),
      ownerUserId: input.ownerUserId,
      patientUserId: input.patientUserId,
      title: input.title,
      description: input.description ?? null,
      dueAt: input.dueAt ?? null,
      remindAt: input.remindAt ?? null,
      isImportant: input.isImportant ?? false,
      completedAt: null,
      reminderSentAt: null,
      createdAt: now,
      updatedAt: now,
    };
    store.push(row);
    return row;
  },

  async update(taskId, ownerUserId, patch) {
    const idx = store.findIndex((t) => t.id === taskId && t.ownerUserId === ownerUserId);
    if (idx < 0) return null;
    const prev = store[idx]!;
    const next: SpecialistTaskRow = {
      ...prev,
      ...patch,
      title: patch.title ?? prev.title,
      description: patch.description !== undefined ? patch.description : prev.description,
      dueAt: patch.dueAt !== undefined ? patch.dueAt : prev.dueAt,
      remindAt: patch.remindAt !== undefined ? patch.remindAt : prev.remindAt,
      isImportant: patch.isImportant ?? prev.isImportant,
      reminderSentAt: patch.clearReminderSent ? null : prev.reminderSentAt,
      updatedAt: new Date().toISOString(),
    };
    store[idx] = next;
    return next;
  },

  async complete(taskId, ownerUserId) {
    const idx = store.findIndex((t) => t.id === taskId && t.ownerUserId === ownerUserId);
    if (idx < 0 || store[idx]!.completedAt) return null;
    const now = new Date().toISOString();
    store[idx] = { ...store[idx]!, completedAt: now, updatedAt: now };
    return store[idx]!;
  },

  async delete(taskId, ownerUserId) {
    const idx = store.findIndex((t) => t.id === taskId && t.ownerUserId === ownerUserId);
    if (idx < 0) return false;
    store.splice(idx, 1);
    return true;
  },

  async getPatientSummary(ownerUserId, patientUserId) {
    const open = await this.listForOwner({ ownerUserId, patientUserId, includeCompleted: false });
    const next = pickNextImportantOrOverdue(open);
    return {
      openCount: open.length,
      nextImportantOrOverdue: next
        ? { id: next.id, title: next.title, dueAt: next.dueAt, isImportant: next.isImportant }
        : null,
    };
  },

  async listDueReminders(nowIso, limit) {
    return store
      .filter(
        (t) =>
          !t.completedAt &&
          t.remindAt &&
          t.remindAt <= nowIso &&
          !t.reminderSentAt,
      )
      .slice(0, limit);
  },

  async markReminderSent(taskId, sentAtIso) {
    const idx = store.findIndex((t) => t.id === taskId);
    if (idx >= 0) store[idx] = { ...store[idx]!, reminderSentAt: sentAtIso, updatedAt: sentAtIso };
  },
};
