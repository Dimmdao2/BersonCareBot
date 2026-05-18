import { beforeEach, describe, expect, it } from "vitest";
import {
  inMemoryNotificationDeliveryAttemptsPort,
  resetInMemoryNotificationDeliveryAttemptsForTests,
} from "@/infra/repos/inMemoryNotificationDeliveryAttempts";
import { createNotificationDeliveryService } from "./service";

describe("notification delivery service", () => {
  const service = createNotificationDeliveryService(inMemoryNotificationDeliveryAttemptsPort);

  beforeEach(() => {
    resetInMemoryNotificationDeliveryAttemptsForTests();
  });

  it("records success attempt", async () => {
    await service.recordNotificationDeliveryAttempt({
      channel: "telegram",
      status: "success",
      integratorUserId: "42",
      eventId: "ev-1",
    });
    const snap = await service.getHealthSnapshot24h();
    expect(snap.byChannel.telegram.successCount).toBe(1);
  });

  it("records failed attempt", async () => {
    await service.recordNotificationDeliveryAttempt({
      channel: "max",
      status: "failed",
      reason: "provider_error",
      errorMessage: "timeout",
    });
    const snap = await service.getHealthSnapshot24h();
    expect(snap.byChannel.max.failedCount).toBe(1);
    expect(snap.byChannel.max.lastErrorReason).toBe("provider_error");
  });

  it("records skipped attempt", async () => {
    await service.recordNotificationDeliveryAttempt({
      channel: "web_push",
      status: "skipped",
      reason: "no_active_subscriptions",
      userId: "00000000-0000-4000-8000-000000000001",
    });
    const snap = await service.getHealthSnapshot24h();
    expect(snap.byChannel.web_push.skippedCount).toBe(1);
    expect(snap.recentIssues[0]?.reason).toBe("no_active_subscriptions");
  });

  it("does not throw when port insert fails", async () => {
    const failing = {
      recordAttempt: async () => {
        throw new Error("db down");
      },
      getHealthSnapshot24h: inMemoryNotificationDeliveryAttemptsPort.getHealthSnapshot24h,
    };
    const svc = createNotificationDeliveryService(failing);
    await expect(
      svc.recordNotificationDeliveryAttempt({ channel: "email", status: "success" }),
    ).resolves.toBeUndefined();
  });
});
