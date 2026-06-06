import {
  resolveSpecialistTaskReminderChannelsForUser,
  type ResolveSpecialistTaskReminderChannelsDeps,
} from "@/modules/doctor-notifications/resolveSpecialistTaskReminderChannels";
import type { SpecialistTasksService } from "./service";
import {
  notifySpecialistTaskReminder,
  type NotifySpecialistTaskReminderDeps,
} from "./notifySpecialistTaskReminder";

export type DispatchSpecialistTaskRemindersDeps = NotifySpecialistTaskReminderDeps &
  ResolveSpecialistTaskReminderChannelsDeps & {
    specialistTasks: SpecialistTasksService;
    resolvePatientDisplayName?: (patientUserId: string) => Promise<string | null>;
  };

export async function dispatchDueSpecialistTaskReminders(
  deps: DispatchSpecialistTaskRemindersDeps,
  opts?: { limit?: number; now?: Date },
): Promise<{ processed: number; sent: number; errors: number }> {
  const limit = opts?.limit ?? 50;
  const now = opts?.now ?? new Date();
  const nowIso = now.toISOString();
  const due = await deps.specialistTasks.listDueReminders(nowIso, limit);

  let sent = 0;
  let errors = 0;

  for (const task of due) {
    try {
      const patientName =
        task.patientUserId && deps.resolvePatientDisplayName
          ? await deps.resolvePatientDisplayName(task.patientUserId)
          : null;
      const channels = await resolveSpecialistTaskReminderChannelsForUser(task.ownerUserId, deps);
      const result = await notifySpecialistTaskReminder(
        task,
        { ...deps, getReminderChannels: async () => channels },
        { patientDisplayName: patientName },
      );
      if (result.sent || result.undeliverable) {
        await deps.specialistTasks.markReminderSent(task.id, nowIso);
        if (result.sent) sent += 1;
      }
    } catch {
      errors += 1;
    }
  }

  return { processed: due.length, sent, errors };
}
