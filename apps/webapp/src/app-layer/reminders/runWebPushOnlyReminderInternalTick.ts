import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { pgWebPushOnlyRemindersPort } from "@/infra/repos/pgWebPushOnlyReminders";
import {
  runWebPushOnlyReminderTick,
  type WebPushOnlyReminderTickResult,
} from "@/modules/reminders/webPushOnlyScheduler";

/**
 * Cron entry for `POST /api/internal/reminders/web-push-only/tick`.
 */
export async function runWebPushOnlyReminderInternalTick(options?: {
  dispatchLimit?: number;
  nowIso?: string;
}): Promise<WebPushOnlyReminderTickResult> {
  const deps = buildAppDeps();
  return runWebPushOnlyReminderTick(
    {
      reminders: pgWebPushOnlyRemindersPort,
      notify: {
        channelPreferences: deps.channelPreferencesPort,
        topicChannelPrefs: deps.topicChannelPrefs,
        webPushSubscriptions: deps.webPushSubscriptions,
        systemSettings: deps.systemSettings,
        readReminderNotifyGate: deps.readReminderNotifyGate,
        notificationDelivery: deps.notificationDelivery,
      },
    },
    {
      dispatchLimit: options?.dispatchLimit,
      nowIso: options?.nowIso,
    },
  );
}
