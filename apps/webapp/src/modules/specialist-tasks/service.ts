import type { CreateSpecialistTaskInput, SpecialistTasksPort, UpdateSpecialistTaskInput } from "./ports";
import { pickNextImportantOrOverdue } from "./taskPriority";
import type { SpecialistTaskPatientSummary } from "./types";

function trimTitle(title: string): string {
  return title.trim();
}

export function createSpecialistTasksService(port: SpecialistTasksPort) {
  return {
    listForOwner(params: Parameters<SpecialistTasksPort["listForOwner"]>[0]) {
      return port.listForOwner(params);
    },

    listGlobalOpen(ownerUserId: string, limit = 20) {
      return port.listForOwner({
        ownerUserId,
        patientUserId: null,
        includeCompleted: false,
        limit,
      });
    },

    listPatientTasks(ownerUserId: string, patientUserId: string, includeCompleted = false) {
      return port.listForOwner({
        ownerUserId,
        patientUserId,
        includeCompleted,
      });
    },

    getPatientSummary(ownerUserId: string, patientUserId: string): Promise<SpecialistTaskPatientSummary> {
      return port.getPatientSummary(ownerUserId, patientUserId);
    },

    async create(input: CreateSpecialistTaskInput) {
      const title = trimTitle(input.title);
      if (!title) throw new Error("empty_title");
      const description = input.description?.trim() ? input.description.trim() : null;
      return port.create({ ...input, title, description });
    },

    async update(taskId: string, ownerUserId: string, patch: UpdateSpecialistTaskInput) {
      if (patch.title !== undefined) {
        const title = trimTitle(patch.title);
        if (!title) throw new Error("empty_title");
        patch = { ...patch, title };
      }
      if (patch.description !== undefined) {
        patch = {
          ...patch,
          description: patch.description?.trim() ? patch.description.trim() : null,
        };
      }
      return port.update(taskId, ownerUserId, patch);
    },

    complete(taskId: string, ownerUserId: string) {
      return port.complete(taskId, ownerUserId);
    },

    delete(taskId: string, ownerUserId: string) {
      return port.delete(taskId, ownerUserId);
    },

    getByIdForOwner(taskId: string, ownerUserId: string) {
      return port.getByIdForOwner(taskId, ownerUserId);
    },

    listDueReminders(nowIso: string, limit: number) {
      return port.listDueReminders(nowIso, limit);
    },

    markReminderSent(taskId: string, sentAtIso: string) {
      return port.markReminderSent(taskId, sentAtIso);
    },

    async buildPatientSummaryFromTasks(
      ownerUserId: string,
      patientUserId: string,
    ): Promise<SpecialistTaskPatientSummary> {
      const open = await port.listForOwner({
        ownerUserId,
        patientUserId,
        includeCompleted: false,
      });
      const next = pickNextImportantOrOverdue(open);
      return {
        openCount: open.length,
        nextImportantOrOverdue: next
          ? { id: next.id, title: next.title, dueAt: next.dueAt, isImportant: next.isImportant }
          : null,
      };
    },
  };
}

export type SpecialistTasksService = ReturnType<typeof createSpecialistTasksService>;
