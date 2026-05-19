import { logger } from "@/infra/logging/logger";
import { planDueReminderOccurrences } from "./planDueReminderOccurrences";
import {
  buildWebPushOnlyReminderNotifyContent,
  resolveWebPushOnlyReminderTopicCode,
} from "./webPushOnlyReminderPayload";
import {
  runPlatformUserReminderWebPushNotify,
  type PlatformUserReminderWebPushNotifyDeps,
} from "./platformUserReminderWebPushNotify";
import type { WebPushOnlyRemindersPort } from "./webPushOnlyPorts";

export type WebPushOnlySchedulerDeps = {
  reminders: WebPushOnlyRemindersPort;
  notify: PlatformUserReminderWebPushNotifyDeps;
};

export type WebPushOnlyReminderTickResult = {
  plannedUpserts: number;
  dispatched: number;
  sent: number;
  failed: number;
  skippedNoTopic: number;
};

export async function runWebPushOnlyReminderTick(
  deps: WebPushOnlySchedulerDeps,
  options?: { nowIso?: string; planLimit?: number; dispatchLimit?: number },
): Promise<WebPushOnlyReminderTickResult> {
  const nowIso = options?.nowIso ?? new Date().toISOString();
  const dispatchLimit = Math.max(1, Math.min(options?.dispatchLimit ?? 50, 100));

  let plannedUpserts = 0;
  const rules = await deps.reminders.listEnabledWebPushOnlyRules(nowIso);
  const planCap = options?.planLimit ?? rules.length;
  for (const rule of rules.slice(0, planCap)) {
    const drafts = planDueReminderOccurrences(
      {
        id: rule.integratorRuleId,
        isEnabled: rule.isEnabled,
        scheduleType: rule.scheduleType,
        timezone: rule.timezone,
        intervalMinutes: rule.intervalMinutes,
        windowStartMinute: rule.windowStartMinute,
        windowEndMinute: rule.windowEndMinute,
        daysMask: rule.daysMask,
        scheduleData: rule.scheduleData,
        quietHoursStartMinute: rule.quietHoursStartMinute,
        quietHoursEndMinute: rule.quietHoursEndMinute,
      },
      nowIso,
    );
    if (drafts.length === 0) continue;
    plannedUpserts += await deps.reminders.upsertPlannedOccurrences(
      rule.platformUserId,
      rule.integratorRuleId,
      drafts,
    );
  }

  const due = await deps.reminders.claimDueOccurrences(nowIso, dispatchLimit);
  let sent = 0;
  let failed = 0;
  let skippedNoTopic = 0;

  for (const occ of due) {
    const rule = await deps.reminders.getRuleByIntegratorRuleId(occ.integratorRuleId);
    if (!rule) {
      await deps.reminders.markOccurrenceFailed(occ.id, "rule_missing");
      failed += 1;
      continue;
    }

    const topicCode = resolveWebPushOnlyReminderTopicCode(rule);
    if (!topicCode) {
      await deps.reminders.markOccurrenceFailed(occ.id, "no_topic_code");
      skippedNoTopic += 1;
      continue;
    }

    const content = await buildWebPushOnlyReminderNotifyContent(rule, (type, id) =>
      deps.reminders.resolveLinkedCatalogTitle(type, id),
    );

    const notifyRes = await runPlatformUserReminderWebPushNotify(
      {
        platformUserId: occ.platformUserId,
        occurrenceId: occ.id,
        topicCode,
        title: content.title,
        bodyText: content.bodyText,
        openUrl: content.openUrl,
      },
      deps.notify,
    );

    if (notifyRes.ok && notifyRes.delivered > 0) {
      await deps.reminders.markOccurrenceSent(occ.id);
      sent += 1;
    } else if (notifyRes.ok && notifyRes.skipped) {
      await deps.reminders.markOccurrenceFailed(occ.id, notifyRes.skipped);
      failed += 1;
    } else {
      await deps.reminders.markOccurrenceFailed(
        occ.id,
        !notifyRes.ok ? notifyRes.error : "not_delivered",
      );
      failed += 1;
    }
  }

  const result: WebPushOnlyReminderTickResult = {
    plannedUpserts,
    dispatched: due.length,
    sent,
    failed,
    skippedNoTopic,
  };

  logger.info(
    { event: "web_push_only_reminder.tick", nowIso, ...result },
    "web push-only reminder tick completed",
  );

  return result;
}
