import { describe, expect, it } from "vitest";
import { NOTIFICATION_DELIVERY_CHANNELS } from "@/modules/notification-delivery/types";
import {
  classifyNotificationDeliverySystemHealthStatus,
  filterOperatorRelevantDeliveryIssues,
} from "./adminNotificationDeliveryHealthMetrics";

function emptyByChannel() {
  return Object.fromEntries(
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
  ) as ReturnType<typeof classifyNotificationDeliverySystemHealthStatus> extends never
    ? never
    : import("@/modules/notification-delivery/types").NotificationDeliveryHealthSnapshot["byChannel"];
}

describe("classifyNotificationDeliverySystemHealthStatus", () => {
  it("returns not_configured when no vapid, smtp and no attempts", () => {
    expect(
      classifyNotificationDeliverySystemHealthStatus({
        totalAttempts24h: 0,
        byChannel: emptyByChannel(),
        recentIssues: [],
        vapidConfigured: false,
        smtpConfigured: false,
      }),
    ).toBe("not_configured");
  });

  it("returns not_configured when attempts exist but vapid and smtp both missing", () => {
    const byChannel = emptyByChannel();
    byChannel.telegram.successCount = 1;
    expect(
      classifyNotificationDeliverySystemHealthStatus({
        totalAttempts24h: 1,
        byChannel,
        recentIssues: [],
        vapidConfigured: false,
        smtpConfigured: false,
      }),
    ).toBe("not_configured");
  });

  it("returns no_data when no attempts but smtp configured", () => {
    expect(
      classifyNotificationDeliverySystemHealthStatus({
        totalAttempts24h: 0,
        byChannel: emptyByChannel(),
        recentIssues: [],
        vapidConfigured: false,
        smtpConfigured: true,
      }),
    ).toBe("no_data");
  });

  it("returns ok when there are successes and no failures", () => {
    const byChannel = emptyByChannel();
    byChannel.telegram.successCount = 3;
    expect(
      classifyNotificationDeliverySystemHealthStatus({
        totalAttempts24h: 3,
        byChannel,
        recentIssues: [],
        vapidConfigured: true,
        smtpConfigured: true,
      }),
    ).toBe("ok");
  });

  it("returns degraded when there are failed attempts", () => {
    const byChannel = emptyByChannel();
    byChannel.web_push.failedCount = 1;
    expect(
      classifyNotificationDeliverySystemHealthStatus({
        totalAttempts24h: 1,
        byChannel,
        recentIssues: [],
        vapidConfigured: true,
        smtpConfigured: true,
      }),
    ).toBe("degraded");
  });

  it("returns ok on user/product skip reasons (missing_binding, channel_not_allowed_for_topic)", () => {
    const byChannel = emptyByChannel();
    byChannel.max.skippedCount = 5;
    byChannel.email.skippedCount = 3;
    byChannel.telegram.successCount = 10;
    expect(
      classifyNotificationDeliverySystemHealthStatus({
        totalAttempts24h: 18,
        byChannel,
        recentIssues: [
          {
            createdAt: new Date().toISOString(),
            channel: "max",
            status: "skipped",
            reason: "missing_binding",
            topicCode: "exercise_reminders",
            recipientRef: null,
            userId: null,
            errorMessage: null,
          },
          {
            createdAt: new Date().toISOString(),
            channel: "email",
            status: "skipped",
            reason: "channel_not_allowed_for_topic",
            topicCode: "exercise_reminders",
            recipientRef: null,
            userId: null,
            errorMessage: null,
          },
        ],
        vapidConfigured: true,
        smtpConfigured: true,
      }),
    ).toBe("ok");
  });

  it("returns ok on recipient_blocked_bot skip (user blocked bot)", () => {
    const byChannel = emptyByChannel();
    byChannel.telegram.skippedCount = 2;
    byChannel.telegram.successCount = 5;
    expect(
      classifyNotificationDeliverySystemHealthStatus({
        totalAttempts24h: 7,
        byChannel,
        recentIssues: [
          {
            createdAt: new Date().toISOString(),
            channel: "telegram",
            status: "skipped",
            reason: "recipient_blocked_bot",
            topicCode: null,
            recipientRef: "telegram:…1234",
            userId: "u1",
            errorMessage: "RECIPIENT_BLOCKED_BOT:telegram",
          },
        ],
        vapidConfigured: true,
        smtpConfigured: true,
      }),
    ).toBe("ok");
  });

  it("filterOperatorRelevantDeliveryIssues drops routine skips", () => {
    const issues = [
      {
        createdAt: new Date().toISOString(),
        channel: "max",
        status: "skipped" as const,
        reason: "missing_binding",
        topicCode: "exercise_reminders",
        recipientRef: null,
        userId: null,
        errorMessage: null,
      },
      {
        createdAt: new Date().toISOString(),
        channel: "telegram",
        status: "failed" as const,
        reason: "provider_error",
        topicCode: null,
        recipientRef: null,
        userId: null,
        errorMessage: "timeout",
      },
    ];
    expect(filterOperatorRelevantDeliveryIssues(issues)).toHaveLength(1);
    expect(filterOperatorRelevantDeliveryIssues(issues)[0]?.channel).toBe("telegram");
  });

  it("returns degraded on infra skip (vapid_missing)", () => {
    const byChannel = emptyByChannel();
    byChannel.web_push.skippedCount = 1;
    expect(
      classifyNotificationDeliverySystemHealthStatus({
        totalAttempts24h: 1,
        byChannel,
        recentIssues: [
          {
            createdAt: new Date().toISOString(),
            channel: "web_push",
            status: "skipped",
            reason: "vapid_missing",
            topicCode: "exercise_reminders",
            recipientRef: null,
            userId: null,
            errorMessage: null,
          },
        ],
        vapidConfigured: false,
        smtpConfigured: true,
      }),
    ).toBe("degraded");
  });
});
