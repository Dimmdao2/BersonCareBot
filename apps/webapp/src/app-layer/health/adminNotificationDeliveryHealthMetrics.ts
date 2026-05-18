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
  "missing_email",
  "email_not_verified",
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
  if (input.totalAttempts24h <= 0) {
    if (!input.vapidConfigured && !input.smtpConfigured) return "not_configured";
    return "no_data";
  }

  if (!input.vapidConfigured && !input.smtpConfigured) return "not_configured";

  const hasSuccess = NOTIFICATION_DELIVERY_CHANNELS.some((ch) => input.byChannel[ch].successCount > 0);
  const hasFailed = NOTIFICATION_DELIVERY_CHANNELS.some((ch) => input.byChannel[ch].failedCount > 0);
  const hasDegradedSkip = input.recentIssues.some(
    (issue) => issue.status === "skipped" && issue.reason !== null && DEGRADED_SKIP_REASONS.has(issue.reason),
  );

  const pushInfraGap =
    !input.vapidConfigured &&
    (input.byChannel.web_push.failedCount > 0 ||
      input.byChannel.web_push.skippedCount > 0 ||
      input.recentIssues.some((i) => i.channel === "web_push"));
  const emailInfraGap =
    !input.smtpConfigured &&
    (input.byChannel.email.failedCount > 0 ||
      input.byChannel.email.skippedCount > 0 ||
      input.recentIssues.some((i) => i.channel === "email"));

  if (hasFailed || hasDegradedSkip || pushInfraGap || emailInfraGap) return "degraded";
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
