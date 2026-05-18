import type { NotificationDeliveryAttemptsPort } from "@/modules/notification-delivery/ports";
import type {
  NotificationDeliveryChannel,
  NotificationDeliveryHealthSnapshot,
  RecordNotificationDeliveryAttemptInput,
} from "@/modules/notification-delivery/types";
import { NOTIFICATION_DELIVERY_CHANNELS } from "@/modules/notification-delivery/types";

type StoredAttempt = RecordNotificationDeliveryAttemptInput & { createdAt: string; id: string };

const attempts: StoredAttempt[] = [];

export function resetInMemoryNotificationDeliveryAttemptsForTests(): void {
  attempts.length = 0;
}

export const inMemoryNotificationDeliveryAttemptsPort: NotificationDeliveryAttemptsPort = {
  async recordAttempt(input: RecordNotificationDeliveryAttemptInput): Promise<void> {
    attempts.push({ ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  },

  async getHealthSnapshot24h(): Promise<NotificationDeliveryHealthSnapshot> {
    const windowMs = 24 * 60 * 60 * 1000;
    const since = Date.now() - windowMs;
    const recent = attempts.filter((a) => new Date(a.createdAt).getTime() >= since);

    const byChannel = Object.fromEntries(
      NOTIFICATION_DELIVERY_CHANNELS.map((ch) => [
        ch,
        {
          successCount: 0,
          failedCount: 0,
          skippedCount: 0,
          lastAttemptAt: null as string | null,
          lastSuccessAt: null as string | null,
          lastErrorAt: null as string | null,
          lastErrorReason: null as string | null,
          lastErrorMessage: null as string | null,
        },
      ]),
    ) as NotificationDeliveryHealthSnapshot["byChannel"];

    for (const a of recent) {
      const agg = byChannel[a.channel];
      if (a.status === "success") agg.successCount += 1;
      if (a.status === "failed") agg.failedCount += 1;
      if (a.status === "skipped") agg.skippedCount += 1;
      const ts = a.createdAt;
      if (!agg.lastAttemptAt || ts > agg.lastAttemptAt) agg.lastAttemptAt = ts;
      if (a.status === "success" && (!agg.lastSuccessAt || ts > agg.lastSuccessAt)) agg.lastSuccessAt = ts;
      if ((a.status === "failed" || a.status === "skipped") && (!agg.lastErrorAt || ts > agg.lastErrorAt)) {
        agg.lastErrorAt = ts;
        agg.lastErrorReason = a.reason ?? null;
        agg.lastErrorMessage = a.errorMessage ?? null;
      }
    }

    const recentIssues = recent
      .filter((a) => a.status === "failed" || a.status === "skipped")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10)
      .map((a) => ({
        createdAt: a.createdAt,
        channel: a.channel,
        status: a.status as "failed" | "skipped",
        reason: a.reason ?? null,
        topicCode: a.topicCode ?? null,
        recipientRef: a.recipientRef ?? null,
        userId: a.userId ?? null,
        errorMessage: a.errorMessage ?? null,
      }));

    return {
      windowHours: 24,
      byChannel,
      recentIssues,
      totalAttempts24h: recent.length,
    };
  },
};
