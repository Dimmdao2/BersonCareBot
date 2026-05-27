import { describe, expect, it, vi } from "vitest";

import { createInMemoryProductAnalyticsPort } from "@/infra/repos/inMemoryProductAnalytics";
import { runProductAnalyticsRetention } from "@/modules/product-analytics/productAnalyticsRetention";

describe("runProductAnalyticsRetention", () => {
  it("purges stale rows across tables (inMemory)", async () => {
    const port = createInMemoryProductAnalyticsPort();
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();

    await port.recordEventsBatch([
      { eventType: "app_open", entryChannel: "browser", userId: "u1", occurredAt: old },
    ]);
    await port.createPushNotification({
      id: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000099",
      createdAt: old,
    });

    const dry = await runProductAnalyticsRetention(port, {
      dryRun: true,
      recentDays: 90,
      userHourlyDays: 180,
      hourlyDays: 730,
      pushDays: 365,
    });
    expect(dry.deletedRecent).toBeGreaterThan(0);
    expect(dry.deletedPushNotifications).toBeGreaterThan(0);

    const result = await runProductAnalyticsRetention(port, {
      recentDays: 90,
      pushDays: 365,
    });
    expect(result.deletedRecent).toBeGreaterThan(0);
    expect(result.deletedPushNotifications).toBeGreaterThan(0);
  });

  it("delegates to port purge methods", async () => {
    const port = {
      purgeRecentOlderThan: vi.fn(async () => ({ deleted: 1 })),
      purgeUserHourlyOlderThan: vi.fn(async () => ({ deleted: 2 })),
      purgeHourlyOlderThan: vi.fn(async () => ({ deleted: 3 })),
      purgePushNotificationsOlderThan: vi.fn(async () => ({ deleted: 4 })),
    };
    const result = await runProductAnalyticsRetention(port as never, { dryRun: true, recentDays: 10 });
    expect(result).toMatchObject({
      dryRun: true,
      recentDays: 10,
      deletedRecent: 1,
      deletedUserHourly: 2,
      deletedHourly: 3,
      deletedPushNotifications: 4,
    });
    expect(port.purgeRecentOlderThan).toHaveBeenCalledWith(10, { dryRun: true });
  });
});
