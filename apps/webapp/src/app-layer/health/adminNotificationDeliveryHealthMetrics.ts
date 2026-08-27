import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import { smtpInnerFromValueJson } from '@/modules/system-settings/smtpOutboundPatch';
import type { NotificationDeliveryHealthSnapshot } from '@/modules/notification-delivery/types';
import {
  NOTIFICATION_DELIVERY_CHANNELS,
  type NotificationDeliverySystemHealthStatus,
} from '@/modules/notification-delivery/types';
import { getWebPushVapidKeyPair } from '@/modules/system-settings/webPushVapidRuntime';

export const NOTIFICATION_DELIVERY_HEALTH_WINDOW_HOURS = 24 as const;

/**
 * Skip reasons that indicate misconfiguration or provider failure — not user/product choice.
 * User-facing skips (no binding, topic disallows channel, prefs off) stay in DB for analytics
 * but must not mark «Здоровье системы» as degraded.
 */
const OPERATOR_DEGRADED_SKIP_REASONS = new Set([
  'vapid_missing',
  'provider_disabled',
  'smtp_error',
  'provider_error',
]);

export function isOperatorRelevantDeliveryIssue(issue: {
  status: string;
  reason: string | null;
}): boolean {
  if (issue.status === 'failed') return true;
  return (
    issue.status === 'skipped' &&
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
  status: NotificationDeliverySystemHealthStatus = 'no_data',
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
        lastProviderStatusCode: null,
        lastErrorReason: null,
        lastErrorMessage: null,
      },
    ]),
  ) as NotificationDeliveryHealthPayload['byChannel'];

  return {
    windowHours: NOTIFICATION_DELIVERY_HEALTH_WINDOW_HOURS,
    status,
    vapidConfigured: false,
    smtpConfigured: false,
    byChannel,
    recentIssues: [],
    totalAttempts24h: 0,
    confirmedDeliveries24h: 0,
    lastConfirmedDeliveryAt: null,
  };
}

/**
 * Audit §C2. Positive evidence of delivery comes ONLY from the canonical lifecycle
 * (`confirmedDeliveries24h`); the failure-only attempt journal can never supply it. `dueBacklog` is
 * what separates the two states that used to be indistinguishable: nothing sent because nothing was
 * asked for (quiet day → `no_data`) versus nothing sent while work is waiting (outage → `degraded`).
 */
export function classifyNotificationDeliverySystemHealthStatus(input: {
  /** FAILED/SKIPPED rows in the failure-only journal within the window. */
  totalAttempts24h: number;
  /** Rows that reached `sent` in `outgoing_delivery_queue` within the window. */
  confirmedDeliveries24h: number;
  /** Queue rows that are due right now — canonical delivery lifecycle, not the attempt journal. */
  dueBacklog: number;
  byChannel: NotificationDeliveryHealthSnapshot['byChannel'];
  recentIssues: NotificationDeliveryHealthSnapshot['recentIssues'];
  vapidConfigured: boolean;
  smtpConfigured: boolean;
}): NotificationDeliverySystemHealthStatus {
  if (!input.vapidConfigured && !input.smtpConfigured) return 'not_configured';

  const hasFailed = NOTIFICATION_DELIVERY_CHANNELS.some(
    (ch) => input.byChannel[ch].failedCount > 0,
  );
  const hasOperatorSkip = input.recentIssues.some(isOperatorRelevantDeliveryIssue);

  const pushInfraGap =
    !input.vapidConfigured &&
    (input.byChannel.web_push.failedCount > 0 ||
      input.recentIssues.some(
        (i) => i.channel === 'web_push' && isOperatorRelevantDeliveryIssue(i),
      ));
  const emailInfraGap =
    !input.smtpConfigured &&
    (input.byChannel.email.failedCount > 0 ||
      input.recentIssues.some((i) => i.channel === 'email' && isOperatorRelevantDeliveryIssue(i)));

  if (hasFailed || hasOperatorSkip || pushInfraGap || emailInfraGap) return 'degraded';
  if (input.confirmedDeliveries24h > 0) return 'ok';
  // Nothing was delivered and nothing failed. Work waiting in the queue means the pipeline is not
  // moving at all — a total outage records no failure row anywhere, so silence is the only symptom.
  if (input.dueBacklog > 0) return 'degraded';
  return 'no_data';
}

export async function loadAdminNotificationDeliveryHealthMetrics(): Promise<
  { ok: true; value: NotificationDeliveryHealthPayload } | { ok: false; errorCode: string }
> {
  try {
    const deps = buildAppDeps();
    const snapshot = await deps.notificationDelivery.getHealthSnapshot24h();
    const queue = await deps.operatorHealthRead.getOutgoingDeliveryQueueHealth();
    const vapidKeys = await getWebPushVapidKeyPair(deps.systemSettings);
    const vapidConfigured = Boolean(vapidKeys);
    const smtp = await deps.systemSettings.getSetting('smtp_outbound', 'admin');
    const smtpParsed = smtp?.valueJson ? smtpInnerFromValueJson(smtp.valueJson) : null;
    const smtpConfigured = smtpParsed?.success === true;

    const operatorRecentIssues = filterOperatorRelevantDeliveryIssues(snapshot.recentIssues);

    const status = classifyNotificationDeliverySystemHealthStatus({
      totalAttempts24h: snapshot.totalAttempts24h,
      confirmedDeliveries24h: queue.confirmedSentLast24h,
      dueBacklog: queue.dueBacklog,
      byChannel: snapshot.byChannel,
      recentIssues: operatorRecentIssues,
      vapidConfigured,
      smtpConfigured,
    });

    return {
      ok: true,
      value: {
        ...snapshot,
        confirmedDeliveries24h: queue.confirmedSentLast24h,
        lastConfirmedDeliveryAt: queue.lastSentAt,
        recentIssues: operatorRecentIssues,
        status,
        vapidConfigured,
        smtpConfigured,
      },
    };
  } catch (err) {
    // Audit §C4/stage 4: an empty catch turned a read FAILURE into an indistinguishable "no data"
    // card. The failure still degrades gracefully for the caller, but it is no longer silent.
    logger.error({ err }, 'notification delivery health read failed');
    return { ok: false, errorCode: 'notification_delivery_health_query_failed' };
  }
}
