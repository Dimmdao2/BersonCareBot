import { describe, expect, it } from "vitest";
import { NOTIFICATION_DELIVERY_CHANNELS } from "@/modules/notification-delivery/types";
import { classifyNotificationDeliverySystemHealthStatus } from "./adminNotificationDeliveryHealthMetrics";

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

  it("returns degraded on config-like skip reason", () => {
    const byChannel = emptyByChannel();
    byChannel.email.skippedCount = 1;
    expect(
      classifyNotificationDeliverySystemHealthStatus({
        totalAttempts24h: 1,
        byChannel,
        recentIssues: [
          {
            createdAt: new Date().toISOString(),
            channel: "email",
            status: "skipped",
            reason: "missing_email",
            topicCode: "appointment_reminders",
            recipientRef: null,
            userId: null,
            errorMessage: null,
          },
        ],
        vapidConfigured: true,
        smtpConfigured: true,
      }),
    ).toBe("degraded");
  });
});
