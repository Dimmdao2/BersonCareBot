import type { SpecialistTasksService } from "./service";
import {
  loadSpecialistTaskReminderChannelsFromSettings,
  notifySpecialistTaskReminder,
  type NotifySpecialistTaskReminderDeps,
} from "./notifySpecialistTaskReminder";

export type DispatchSpecialistTaskRemindersDeps = NotifySpecialistTaskReminderDeps & {
  specialistTasks: SpecialistTasksService;
  resolvePatientDisplayName?: (patientUserId: string) => Promise<string | null>;
  getDoctorSetting: (key: "doctor_specialist_task_reminder_channels") => Promise<{ valueJson: unknown } | null | undefined>;
};

export async function dispatchDueSpecialistTaskReminders(
  deps: DispatchSpecialistTaskRemindersDeps,
  opts?: { limit?: number; now?: Date },
): Promise<{ processed: number; sent: number; errors: number }> {
  const limit = opts?.limit ?? 50;
  const now = opts?.now ?? new Date();
  const nowIso = now.toISOString();
  const due = await deps.specialistTasks.listDueReminders(nowIso, limit);

  const channels = await loadSpecialistTaskReminderChannelsFromSettings(deps.getDoctorSetting);
  if (channels.length === 0) {
    return { processed: due.length, sent: 0, errors: 0 };
  }

  let sent = 0;
  let errors = 0;

  for (const task of due) {
    try {
      const patientName =
        task.patientUserId && deps.resolvePatientDisplayName
          ? await deps.resolvePatientDisplayName(task.patientUserId)
          : null;
      const result = await notifySpecialistTaskReminder(
        task,
        { ...deps, getReminderChannels: async () => channels },
        { patientDisplayName: patientName },
      );
      await deps.specialistTasks.markReminderSent(task.id, nowIso);
      if (result.sent) sent += 1;
    } catch {
      errors += 1;
    }
  }

  return { processed: due.length, sent, errors };
}
