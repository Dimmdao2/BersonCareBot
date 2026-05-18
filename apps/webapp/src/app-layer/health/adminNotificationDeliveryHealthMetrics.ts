import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { smtpInnerFromValueJson } from "@/modules/outbound-email/sendTransactionalSmtp";
import type { NotificationDeliveryHealthSnapshot } from "@/modules/notification-delivery/types";
import {
  NOTIFICATION_DELIVERY_CHANNELS,
  type NotificationDeliverySystemHealthStatus,
} from "@/modules/notification-delivery/types";
import { getWebPushVapidKeyPair } from "@/modules/system-settings/webPushVapidRuntime";

export const NOTIFICATION_DELIVERY_HEALTH_WINDOW_HOURS = 24 as const;

const DEGRADED_SKIP_REASONS = new Set([
  "vapid_missing",
  "provider_disabled",
  "smtp_error",
  "provider_error",
  "no_active_subscriptions",
  "missing_binding",
]);

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
  if (!input.vapidConfigured && !input.smtpConfigured && input.totalAttempts24h === 0) {
    return "not_configured";
  }

  if (input.totalAttempts24h <= 0) {
    return "no_data";
  }

  const hasSuccess = NOTIFICATION_DELIVERY_CHANNELS.some((ch) => input.byChannel[ch].successCount > 0);
  const hasFailed = NOTIFICATION_DELIVERY_CHANNELS.some((ch) => input.byChannel[ch].failedCount > 0);
  const hasDegradedSkip = input.recentIssues.some(
    (issue) => issue.status === "skipped" && issue.reason !== null && DEGRADED_SKIP_REASONS.has(issue.reason),
  );

  if (hasFailed || hasDegradedSkip) return "degraded";
  if (hasSuccess) return "ok";
  return "degraded";
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

    const status = classifyNotificationDeliverySystemHealthStatus({
      totalAttempts24h: snapshot.totalAttempts24h,
      byChannel: snapshot.byChannel,
      recentIssues: snapshot.recentIssues,
      vapidConfigured,
      smtpConfigured,
    });

    return {
      ok: true,
      value: {
        ...snapshot,
        status,
        vapidConfigured,
        smtpConfigured,
      },
    };
  } catch {
    return { ok: false, errorCode: "notification_delivery_health_query_failed" };
  }
}
