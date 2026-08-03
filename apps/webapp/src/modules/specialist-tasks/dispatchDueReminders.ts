import type { SpecialistTasksService } from './service';
export type DispatchSpecialistTaskRemindersDeps = { specialistTasks: SpecialistTasksService };

export async function dispatchDueSpecialistTaskReminders(
  deps: DispatchSpecialistTaskRemindersDeps,
  opts?: { limit?: number; now?: Date },
): Promise<{ processed: number; enqueued: number }> {
  const limit = opts?.limit ?? 50;
  return deps.specialistTasks.enqueueDueReminders((opts?.now ?? new Date()).toISOString(), limit);
}
