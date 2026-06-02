import type { SpecialistTaskPatientSummary, SpecialistTaskRow } from "./types";

export type CreateSpecialistTaskInput = {
  ownerUserId: string;
  patientUserId: string | null;
  title: string;
  description?: string | null;
  dueAt?: string | null;
  remindAt?: string | null;
  isImportant?: boolean;
};

export type UpdateSpecialistTaskInput = {
  title?: string;
  description?: string | null;
  dueAt?: string | null;
  remindAt?: string | null;
  isImportant?: boolean;
  /** When remindAt changes, caller may reset reminder delivery */
  clearReminderSent?: boolean;
};

export type SpecialistTasksPort = {
  listForOwner(params: {
    ownerUserId: string;
    patientUserId?: string | null;
    includeCompleted?: boolean;
    limit?: number;
  }): Promise<SpecialistTaskRow[]>;
  getByIdForOwner(taskId: string, ownerUserId: string): Promise<SpecialistTaskRow | null>;
  create(input: CreateSpecialistTaskInput): Promise<SpecialistTaskRow>;
  update(taskId: string, ownerUserId: string, patch: UpdateSpecialistTaskInput): Promise<SpecialistTaskRow | null>;
  complete(taskId: string, ownerUserId: string): Promise<SpecialistTaskRow | null>;
  delete(taskId: string, ownerUserId: string): Promise<boolean>;
  getPatientSummary(ownerUserId: string, patientUserId: string): Promise<SpecialistTaskPatientSummary>;
  listDueReminders(nowIso: string, limit: number): Promise<SpecialistTaskRow[]>;
  markReminderSent(taskId: string, sentAtIso: string): Promise<void>;
};
