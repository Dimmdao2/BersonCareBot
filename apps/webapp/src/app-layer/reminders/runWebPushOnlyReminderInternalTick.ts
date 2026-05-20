import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logger } from "@/app-layer/logging/logger";
import { pgWebPushOnlyRemindersPort } from "@/infra/repos/pgWebPushOnlyReminders";
import {
  runWebPushOnlyReminderTick,
  webPushOnlyReminderTickMetaFromResult,
  type WebPushOnlyReminderTickResult,
} from "@/modules/reminders/webPushOnlyScheduler";

/**
 * Cron entry for `POST /api/internal/reminders/web-push-only/tick`.
 */
export async function runWebPushOnlyReminderInternalTick(options?: {
  dispatchLimit?: number;
  nowIso?: string;
}): Promise<WebPushOnlyReminderTickResult> {
  const reconcileStartedAt = Date.now();
  const startedAtIso = new Date(reconcileStartedAt).toISOString();
  const deps = buildAppDeps();

  const result = await runWebPushOnlyReminderTick(
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

  const durationMs = Date.now() - reconcileStartedAt;
  try {
    await deps.operatorHealthWrite.recordWebPushOnlyReminderTickSuccess({
      startedAtIso,
      durationMs,
      metaJson: webPushOnlyReminderTickMetaFromResult(result),
    });
  } catch (tickErr) {
    logger.warn(
      { err: tickErr },
      "[internal/reminders/web-push-only/tick] operator_job_status success tick failed",
    );
  }

  return result;
}
