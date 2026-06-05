import { describe, expect, it, vi } from "vitest";

import { createInMemoryProductAnalyticsPort } from "@/infra/repos/inMemoryProductAnalytics";
import type { ProductAnalyticsPort } from "@/modules/product-analytics/ports";
import { createProductAnalyticsService } from "@/modules/product-analytics/service";

describe("createProductAnalyticsService", () => {
  it("rejects batches larger than 20", async () => {
    const svc = createProductAnalyticsService(createInMemoryProductAnalyticsPort());
    const events = Array.from({ length: 21 }, () => ({
      eventType: "heartbeat" as const,
      entryChannel: "browser" as const,
      userId: "user-1",
    }));
    await expect(svc.recordEventsBatch(events)).rejects.toThrow("batch_too_large");
  });

  it("dedupes push_open by tracking id", async () => {
    const port = createInMemoryProductAnalyticsPort();
    const svc = createProductAnalyticsService(port);
    await svc.createPushNotification({
      id: "push-1",
      userId: "user-1",
      topicCode: "warmup",
      pushKind: "warmup",
    });
    const first = await svc.recordPushOpen({ pushTrackingId: "push-1", userId: "user-1" });
    const second = await svc.recordPushOpen({ pushTrackingId: "push-1", userId: "user-1" });
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
  });

  it("attributes push_open to push owner when session user missing", async () => {
    const port = createInMemoryProductAnalyticsPort();
    const svc = createProductAnalyticsService(port);
    await svc.createPushNotification({
      id: "push-owner",
      userId: "user-owner",
      topicCode: "warmup",
      pushKind: "warmup",
    });
    const first = await svc.recordPushOpen({ pushTrackingId: "push-owner", userId: null });
    const second = await svc.recordPushOpen({ pushTrackingId: "push-owner", userId: null });
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);

    const dashboard = await svc.getAdminDashboard({ windowHours: 24 });
    expect(dashboard.summary.totalPushOpens).toBe(1);
    expect(dashboard.clientActivity[0]).toMatchObject({
      userId: "user-owner",
      pushOpens: 1,
    });
  });

  it("drops page_view outside patient paths", async () => {
    const recordEventsBatch = vi.fn(async (_events: Parameters<ProductAnalyticsPort["recordEventsBatch"]>[0]) => {});
    const port: ProductAnalyticsPort = {
      recordEventsBatch,
      createPushNotification: vi.fn(),
      recordPushOpen: vi.fn(async () => ({ deduped: false })),
      getAdminDashboard: vi.fn(),
      purgeRecentOlderThan: vi.fn(async () => ({ deleted: 0 })),
      purgeUserHourlyOlderThan: vi.fn(async () => ({ deleted: 0 })),
      purgeHourlyOlderThan: vi.fn(async () => ({ deleted: 0 })),
      purgePushNotificationsOlderThan: vi.fn(async () => ({ deleted: 0 })),
      listRegistrationEvents: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 50 })),
    };
    const svc = createProductAnalyticsService(port);
    await svc.recordEventsBatch([
      {
        eventType: "page_view",
        entryChannel: "browser",
        userId: "user-1",
        pageKey: "/app/doctor/clients",
      },
    ]);
    expect(recordEventsBatch).toHaveBeenCalledWith([]);
  });

  it("normalizes page_key before ingest", async () => {
    const port = createInMemoryProductAnalyticsPort();
    const svc = createProductAnalyticsService(port);
    await svc.recordEventsBatch([
      {
        eventType: "page_view",
        entryChannel: "pwa",
        userId: "user-1",
        pageKey: "/app/patient/content/article-one?x=1",
      },
    ]);
    const dashboard = await svc.getAdminDashboard({ windowHours: 24 });
    expect(dashboard.topPages).toEqual([
      {
        pageKey: "/app/patient/content/page",
        pageLabel: "Страница контента",
        views: 1,
        uniqueUsers: 1,
      },
    ]);
  });
});
