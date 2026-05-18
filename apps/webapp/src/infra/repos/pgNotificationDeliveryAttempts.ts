import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { notificationDeliveryAttempts } from "../../../db/schema/notificationDeliveryAttempts";
import type { NotificationDeliveryAttemptsPort } from "@/modules/notification-delivery/ports";
import {
  NOTIFICATION_DELIVERY_CHANNELS,
  type NotificationDeliveryChannel,
  type NotificationDeliveryChannelAggregate,
  type NotificationDeliveryHealthSnapshot,
  type NotificationDeliveryRecentIssue,
  type RecordNotificationDeliveryAttemptInput,
} from "@/modules/notification-delivery/types";

const HEALTH_WINDOW_HOURS = 24;

function emptyChannelAggregate(): NotificationDeliveryChannelAggregate {
  return {
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorReason: null,
    lastErrorMessage: null,
  };
}

function isDeliveryChannel(value: string): value is NotificationDeliveryChannel {
  return (NOTIFICATION_DELIVERY_CHANNELS as readonly string[]).includes(value);
}

function parseOccurrenceId(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export const pgNotificationDeliveryAttemptsPort: NotificationDeliveryAttemptsPort = {
  async recordAttempt(input: RecordNotificationDeliveryAttemptInput): Promise<void> {
    const db = getDrizzle();
    await db.insert(notificationDeliveryAttempts).values({
      userId: input.userId ?? null,
      integratorUserId: input.integratorUserId ?? null,
      topicCode: input.topicCode ?? null,
      intentType: input.intentType ?? null,
      channel: input.channel,
      status: input.status,
      reason: input.reason ?? null,
      providerStatusCode: input.providerStatusCode ?? null,
      eventId: input.eventId ?? null,
      occurrenceId: parseOccurrenceId(input.occurrenceId),
      endpointHash: input.endpointHash ?? null,
      recipientRef: input.recipientRef ?? null,
      errorMessage: input.errorMessage ?? null,
      metadata: input.metadata ?? {},
    });
  },

  async getHealthSnapshot24h(): Promise<NotificationDeliveryHealthSnapshot> {
    const db = getDrizzle();
    const windowFilter = sql`${notificationDeliveryAttempts.createdAt} >= now() - interval '24 hours'`;

    const byChannel = Object.fromEntries(
      NOTIFICATION_DELIVERY_CHANNELS.map((ch) => [ch, emptyChannelAggregate()]),
    ) as Record<NotificationDeliveryChannel, NotificationDeliveryChannelAggregate>;

    const countRows = await db
      .select({
        channel: notificationDeliveryAttempts.channel,
        status: notificationDeliveryAttempts.status,
        c: count(),
      })
      .from(notificationDeliveryAttempts)
      .where(windowFilter)
      .groupBy(notificationDeliveryAttempts.channel, notificationDeliveryAttempts.status);

    let totalAttempts24h = 0;
    for (const row of countRows) {
      if (!isDeliveryChannel(row.channel)) continue;
      const n = Number(row.c ?? 0);
      totalAttempts24h += n;
      const agg = byChannel[row.channel];
      if (row.status === "success") agg.successCount = n;
      else if (row.status === "failed") agg.failedCount = n;
      else if (row.status === "skipped") agg.skippedCount = n;
    }

    for (const channel of NOTIFICATION_DELIVERY_CHANNELS) {
      const [lastAttempt] = await db
        .select({
          createdAt: notificationDeliveryAttempts.createdAt,
          status: notificationDeliveryAttempts.status,
          reason: notificationDeliveryAttempts.reason,
          errorMessage: notificationDeliveryAttempts.errorMessage,
        })
        .from(notificationDeliveryAttempts)
        .where(
          and(
            eq(notificationDeliveryAttempts.channel, channel),
            windowFilter,
          ),
        )
        .orderBy(desc(notificationDeliveryAttempts.createdAt))
        .limit(1);

      if (lastAttempt) {
        byChannel[channel].lastAttemptAt = lastAttempt.createdAt;
        if (lastAttempt.status === "failed" || lastAttempt.status === "skipped") {
          byChannel[channel].lastErrorAt = lastAttempt.createdAt;
          byChannel[channel].lastErrorReason = lastAttempt.reason ?? null;
          byChannel[channel].lastErrorMessage = lastAttempt.errorMessage ?? null;
        }
      }

      const [lastSuccess] = await db
        .select({ createdAt: notificationDeliveryAttempts.createdAt })
        .from(notificationDeliveryAttempts)
        .where(
          and(
            eq(notificationDeliveryAttempts.channel, channel),
            eq(notificationDeliveryAttempts.status, "success"),
            windowFilter,
          ),
        )
        .orderBy(desc(notificationDeliveryAttempts.createdAt))
        .limit(1);
      if (lastSuccess) {
        byChannel[channel].lastSuccessAt = lastSuccess.createdAt;
      }

      const [lastError] = await db
        .select({
          createdAt: notificationDeliveryAttempts.createdAt,
          reason: notificationDeliveryAttempts.reason,
          errorMessage: notificationDeliveryAttempts.errorMessage,
        })
        .from(notificationDeliveryAttempts)
        .where(
          and(
            eq(notificationDeliveryAttempts.channel, channel),
            inArray(notificationDeliveryAttempts.status, ["failed", "skipped"]),
            windowFilter,
          ),
        )
        .orderBy(desc(notificationDeliveryAttempts.createdAt))
        .limit(1);
      if (lastError) {
        byChannel[channel].lastErrorAt = lastError.createdAt;
        byChannel[channel].lastErrorReason = lastError.reason ?? null;
        byChannel[channel].lastErrorMessage = lastError.errorMessage ?? null;
      }
    }

    const issueRows = await db
      .select({
        createdAt: notificationDeliveryAttempts.createdAt,
        channel: notificationDeliveryAttempts.channel,
        status: notificationDeliveryAttempts.status,
        reason: notificationDeliveryAttempts.reason,
        topicCode: notificationDeliveryAttempts.topicCode,
        recipientRef: notificationDeliveryAttempts.recipientRef,
        userId: notificationDeliveryAttempts.userId,
        errorMessage: notificationDeliveryAttempts.errorMessage,
      })
      .from(notificationDeliveryAttempts)
      .where(
        and(
          windowFilter,
          inArray(notificationDeliveryAttempts.status, ["failed", "skipped"]),
        ),
      )
      .orderBy(desc(notificationDeliveryAttempts.createdAt))
      .limit(10);

    const recentIssues: NotificationDeliveryRecentIssue[] = [];
    for (const row of issueRows) {
      if (!isDeliveryChannel(row.channel)) continue;
      recentIssues.push({
        createdAt: row.createdAt,
        channel: row.channel,
        status: row.status as "failed" | "skipped",
        reason: row.reason ?? null,
        topicCode: row.topicCode ?? null,
        recipientRef: row.recipientRef ?? null,
        userId: row.userId ?? null,
        errorMessage: row.errorMessage ?? null,
      });
    }

    return {
      windowHours: HEALTH_WINDOW_HOURS,
      byChannel,
      recentIssues,
      totalAttempts24h,
    };
  },
};
