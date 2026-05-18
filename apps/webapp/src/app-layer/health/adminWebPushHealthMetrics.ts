import { count, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getWebPushVapidKeyPair } from "@/modules/system-settings/webPushVapidRuntime";
import { userWebPushSubscriptions } from "../../../db/schema/schema";

export const WEB_PUSH_HEALTH_WINDOW_HOURS = 24 as const;

export type WebPushSystemHealthStatus = "ok" | "degraded" | "not_configured" | "no_data";

export type WebPushHealthPayload = {
  windowHours: typeof WEB_PUSH_HEALTH_WINDOW_HOURS;
  status: WebPushSystemHealthStatus;
  vapidConfigured: boolean;
  activeSubscriptionsCount: number;
  usersWithSubscriptionCount: number;
  /** Строки с `updated_at` в rolling window (новые подписки и перепривязки endpoint). */
  subscriptionsTouchedLast24h: number;
  /**
   * Агрегаты доставки (delivered/errors/deactivated, last attempt) пишутся в structured logs,
   * в БД отдельной таблицы нет — оператор смотрит journalctl / log drain по событиям
   * `web_push_send_result`, `web_push_provider_response`, `patient_reminder.notify_channels.*`.
   */
  deliveryMetricsInDb: false;
};

export function emptyWebPushHealthPayload(status: WebPushSystemHealthStatus = "no_data"): WebPushHealthPayload {
  return {
    windowHours: WEB_PUSH_HEALTH_WINDOW_HOURS,
    status,
    vapidConfigured: false,
    activeSubscriptionsCount: 0,
    usersWithSubscriptionCount: 0,
    subscriptionsTouchedLast24h: 0,
    deliveryMetricsInDb: false,
  };
}

export function classifyWebPushSystemHealthStatus(signals: {
  vapidConfigured: boolean;
  activeSubscriptionsCount: number;
}): WebPushSystemHealthStatus {
  if (!signals.vapidConfigured) return "not_configured";
  if (signals.activeSubscriptionsCount <= 0) return "no_data";
  return "ok";
}

/**
 * Operator-facing Web Push / PWA subscription diagnostics from DB + VAPID config.
 * Best-effort; does not fabricate provider delivery counters without persistence.
 */
export async function loadAdminWebPushHealthMetrics(): Promise<
  { ok: true; value: WebPushHealthPayload } | { ok: false; errorCode: string }
> {
  try {
    const db = getDrizzle();
    const deps = buildAppDeps();
    const vapidKeys = await getWebPushVapidKeyPair(deps.systemSettings);
    const vapidConfigured = Boolean(vapidKeys);

    const [totalRows, usersRows, recentRows] = await Promise.all([
      db.select({ c: count() }).from(userWebPushSubscriptions),
      db
        .select({ c: count(sql`DISTINCT ${userWebPushSubscriptions.userId}`) })
        .from(userWebPushSubscriptions),
      db
        .select({ c: count() })
        .from(userWebPushSubscriptions)
        .where(sql`${userWebPushSubscriptions.updatedAt} >= now() - interval '24 hours'`),
    ]);

    const activeSubscriptionsCount = Number(totalRows[0]?.c ?? 0);
    const usersWithSubscriptionCount = Number(usersRows[0]?.c ?? 0);
    const subscriptionsTouchedLast24h = Number(recentRows[0]?.c ?? 0);

    const status = classifyWebPushSystemHealthStatus({ vapidConfigured, activeSubscriptionsCount });

    return {
      ok: true,
      value: {
        windowHours: WEB_PUSH_HEALTH_WINDOW_HOURS,
        status,
        vapidConfigured,
        activeSubscriptionsCount,
        usersWithSubscriptionCount,
        subscriptionsTouchedLast24h,
        deliveryMetricsInDb: false,
      },
    };
  } catch {
    return { ok: false, errorCode: "web_push_health_query_failed" };
  }
}
