import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { smtpInnerFromValueJson } from "@/modules/system-settings/smtpOutboundPatch";
import type { NotificationDeliveryHealthSnapshot } from "@/modules/notification-delivery/types";
import {
  NOTIFICATION_DELIVERY_CHANNELS,
  type NotificationDeliverySystemHealthStatus,
} from "@/modules/notification-delivery/types";
import { getWebPushVapidKeyPair } from "@/modules/system-settings/webPushVapidRuntime";

export const NOTIFICATION_DELIVERY_HEALTH_WINDOW_HOURS = 24 as const;

/**
 * Skip reasons that indicate misconfiguration or provider failure — not user/product choice.
 * User-facing skips (no binding, topic disallows channel, prefs off) stay in DB for analytics
 * but must not mark «Здоровье системы» as degraded.
 */
const OPERATOR_DEGRADED_SKIP_REASONS = new Set([
  "vapid_missing",
  "provider_disabled",
  "smtp_error",
  "provider_error",
]);

export function isOperatorRelevantDeliveryIssue(issue: {
  status: string;
  reason: string | null;
}): boolean {
  if (issue.status === "failed") return true;
  return (
    issue.status === "skipped" &&
    issue.reason !== null &&
    OPERATOR_DEGRADED_SKIP_REASONS.has(issue.reason)
  );
}

/** Issues shown on «Здоровье системы» (excludes routine user/product skips). */
export function filterOperatorRelevantDeliveryIssues<
  T extends { status: string; reason: string | null },
>(issues: T[]): T[] {
  return issues.filter(isOperatorRelevantDeliveryIssue);
}

export type NotificationDeliveryHealthPayload = NotificationDeliveryHealthSnapshot & {
  status: NotificationDeliverySystemHealthStatus;
  vapidConfigured: boolean;
  smtpConfigured: boolean;
};

export function emptyNotificationDeliveryHealthPayload(
  status: NotificationDeliverySystemHealthStatus = "no_data",
): NotificationDeliveryHealthPayload {
  const byChannel = Object.fromEntries(
    NOTIFICATION_DELIVERY_CHANNELS.map((ch) => [
      ch,
      {
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastErrorAt: null,
        lastErrorReason: null,
        lastErrorMessage: null,
      },
    ]),
  ) as NotificationDeliveryHealthPayload["byChannel"];

  return {
    windowHours: NOTIFICATION_DELIVERY_HEALTH_WINDOW_HOURS,
    status,
    vapidConfigured: false,
    smtpConfigured: false,
    byChannel,
    recentIssues: [],
    totalAttempts24h: 0,
  };
}

export function classifyNotificationDeliverySystemHealthStatus(input: {
  totalAttempts24h: number;
  byChannel: NotificationDeliveryHealthSnapshot["byChannel"];
  recentIssues: NotificationDeliveryHealthSnapshot["recentIssues"];
  vapidConfigured: boolean;
  smtpConfigured: boolean;
}): NotificationDeliverySystemHealthStatus {
  if (input.totalAttempts24h <= 0) {
    if (!input.vapidConfigured && !input.smtpConfigured) return "not_configured";
    return "no_data";
  }

  if (!input.vapidConfigured && !input.smtpConfigured) return "not_configured";

  const hasSuccess = NOTIFICATION_DELIVERY_CHANNELS.some((ch) => input.byChannel[ch].successCount > 0);
  const hasFailed = NOTIFICATION_DELIVERY_CHANNELS.some((ch) => input.byChannel[ch].failedCount > 0);
  const hasOperatorSkip = input.recentIssues.some(isOperatorRelevantDeliveryIssue);

  const pushInfraGap =
    !input.vapidConfigured &&
    (input.byChannel.web_push.failedCount > 0 ||
      input.recentIssues.some(
        (i) => i.channel === "web_push" && isOperatorRelevantDeliveryIssue(i),
      ));
  const emailInfraGap =
    !input.smtpConfigured &&
    (input.byChannel.email.failedCount > 0 ||
      input.recentIssues.some(
        (i) => i.channel === "email" && isOperatorRelevantDeliveryIssue(i),
      ));

  if (hasFailed || hasOperatorSkip || pushInfraGap || emailInfraGap) return "degraded";
  if (hasSuccess) return "ok";
  if (input.totalAttempts24h > 0) return "ok";
  return "no_data";
}

export async function loadAdminNotificationDeliveryHealthMetrics(): Promise<
  { ok: true; value: NotificationDeliveryHealthPayload } | { ok: false; errorCode: string }
> {
  try {
    const deps = buildAppDeps();
    const snapshot = await deps.notificationDelivery.getHealthSnapshot24h();
    const vapidKeys = await getWebPushVapidKeyPair(deps.systemSettings);
    const vapidConfigured = Boolean(vapidKeys);
    const smtp = await deps.systemSettings.getSetting("smtp_outbound", "admin");
    const smtpParsed = smtp?.valueJson ? smtpInnerFromValueJson(smtp.valueJson) : null;
    const smtpConfigured = smtpParsed?.success === true;

    const operatorRecentIssues = filterOperatorRelevantDeliveryIssues(snapshot.recentIssues);

    const status = classifyNotificationDeliverySystemHealthStatus({
      totalAttempts24h: snapshot.totalAttempts24h,
      byChannel: snapshot.byChannel,
      recentIssues: operatorRecentIssues,
      vapidConfigured,
      smtpConfigured,
    });

    return {
      ok: true,
      value: {
        ...snapshot,
        recentIssues: operatorRecentIssues,
        status,
        vapidConfigured,
        smtpConfigured,
      },
    };
  } catch {
    return { ok: false, errorCode: "notification_delivery_health_query_failed" };
  }
}
