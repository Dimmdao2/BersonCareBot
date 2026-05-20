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
  rulesFound: number;
  plannedUpserts: number;
  dueClaimed: number;
  /** @deprecated use dueClaimed */
  dispatched: number;
  sent: number;
  skipped: number;
  skippedNoSubscription: number;
  skippedNoTopic: number;
  failed: number;
};

export function webPushOnlyReminderTickMetaFromResult(
  result: WebPushOnlyReminderTickResult,
): Record<string, unknown> {
  return {
    rulesFound: result.rulesFound,
    plannedUpserts: result.plannedUpserts,
    dueClaimed: result.dueClaimed,
    sent: result.sent,
    skipped: result.skipped,
    skippedNoSubscription: result.skippedNoSubscription,
    skippedNoTopic: result.skippedNoTopic,
    failed: result.failed,
  };
}

function isWebPushOnlyReminderTickLogEmpty(result: WebPushOnlyReminderTickResult): boolean {
  return (
    result.dueClaimed === 0 &&
    result.plannedUpserts === 0 &&
    result.sent === 0 &&
    result.failed === 0 &&
    result.skipped === 0 &&
    result.skippedNoSubscription === 0 &&
    result.skippedNoTopic === 0
  );
}

function isWebPushOnlyReminderTickLogActive(result: WebPushOnlyReminderTickResult): boolean {
  return (
    result.plannedUpserts > 0 ||
    result.dueClaimed > 0 ||
    result.sent > 0 ||
    result.skipped > 0 ||
    result.skippedNoSubscription > 0 ||
    result.skippedNoTopic > 0
  );
}

export function logWebPushOnlyReminderTickCompleted(result: WebPushOnlyReminderTickResult, nowIso: string): void {
  const payload = {
    event: "web_push_only_reminder.tick",
    nowIso,
    rulesFound: result.rulesFound,
    dueClaimed: result.dueClaimed,
    plannedUpserts: result.plannedUpserts,
    sent: result.sent,
    skipped: result.skipped,
    skippedNoSubscription: result.skippedNoSubscription,
    skippedNoTopic: result.skippedNoTopic,
    failed: result.failed,
  };

  if (result.failed > 0) {
    logger.warn(payload, "web push-only reminder tick completed with failures");
    return;
  }
  if (isWebPushOnlyReminderTickLogEmpty(result)) {
    return;
  }
  if (isWebPushOnlyReminderTickLogActive(result)) {
    logger.info(payload, "web push-only reminder tick completed");
  }
}

const NOTIFY_SKIP_REASONS = new Set([
  "muted",
  "topic_disabled",
  "web_push_not_selected",
  "vapid_missing",
  "no_active_subscriptions",
]);

function isNotifySkipReason(reason: string): boolean {
  if (NOTIFY_SKIP_REASONS.has(reason)) return true;
  return reason.endsWith("_not_selected") || reason.startsWith("channel_");
}

export async function runWebPushOnlyReminderTick(
  deps: WebPushOnlySchedulerDeps,
  options?: { nowIso?: string; planLimit?: number; dispatchLimit?: number },
): Promise<WebPushOnlyReminderTickResult> {
  const nowIso = options?.nowIso ?? new Date().toISOString();
  const dispatchLimit = Math.max(1, Math.min(options?.dispatchLimit ?? 50, 100));

  let plannedUpserts = 0;
  const rules = await deps.reminders.listEnabledWebPushOnlyRules(nowIso);
  const rulesFound = rules.length;
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
  const dueClaimed = due.length;
  let sent = 0;
  let skipped = 0;
  let skippedNoSubscription = 0;
  let skippedNoTopic = 0;
  let failed = 0;

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
      skipped += 1;
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
      if (isNotifySkipReason(notifyRes.skipped)) {
        skipped += 1;
        if (notifyRes.skipped === "no_active_subscriptions") {
          skippedNoSubscription += 1;
        }
      } else {
        failed += 1;
      }
    } else {
      await deps.reminders.markOccurrenceFailed(
        occ.id,
        !notifyRes.ok ? notifyRes.error : "not_delivered",
      );
      failed += 1;
    }
  }

  const result: WebPushOnlyReminderTickResult = {
    rulesFound,
    plannedUpserts,
    dueClaimed,
    dispatched: dueClaimed,
    sent,
    skipped,
    skippedNoSubscription,
    skippedNoTopic,
    failed,
  };

  logWebPushOnlyReminderTickCompleted(result, nowIso);

  return result;
}
