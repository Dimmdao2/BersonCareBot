import { describe, expect, it } from "vitest";

import { buildAdminDashboard } from "@/modules/product-analytics/buildAdminDashboard";
import { PRODUCT_ANALYTICS_DIM_ALL } from "@/modules/product-analytics/types";

const ALL = PRODUCT_ANALYTICS_DIM_ALL;

describe("buildAdminDashboard", () => {
  const startHour = "2026-05-20T10:00:00.000Z";
  const bucket = "2026-05-20T12:00:00.000Z";

  it("aggregates summary, channels, pages, push and daily users", () => {
    const dashboard = buildAdminDashboard({
      windowHours: 168,
      startHourInclusive: startHour,
      hourlyRows: [
        {
          bucketHour: bucket,
          eventType: "app_open",
          entryChannel: "pwa",
          pageKey: ALL,
          topicCode: ALL,
          pushKind: ALL,
          warmupSloganKey: ALL,
          eventCount: 3,
        },
        {
          bucketHour: bucket,
          eventType: "app_open",
          entryChannel: "telegram",
          pageKey: ALL,
          topicCode: ALL,
          pushKind: ALL,
          warmupSloganKey: ALL,
          eventCount: 1,
        },
        {
          bucketHour: bucket,
          eventType: "page_view",
          entryChannel: "pwa",
          pageKey: "/app/patient/home",
          topicCode: ALL,
          pushKind: ALL,
          warmupSloganKey: ALL,
          eventCount: 5,
        },
        {
          bucketHour: bucket,
          eventType: "push_sent",
          entryChannel: ALL,
          pageKey: ALL,
          topicCode: "warmup_reminder",
          pushKind: "warmup",
          warmupSloganKey: "s1",
          eventCount: 10,
        },
        {
          bucketHour: bucket,
          eventType: "push_open",
          entryChannel: ALL,
          pageKey: ALL,
          topicCode: "warmup_reminder",
          pushKind: "warmup",
          warmupSloganKey: "s1",
          eventCount: 2,
        },
      ],
      userHourlyRows: [
        {
          bucketHour: bucket,
          userId: "u1",
          entryChannel: "pwa",
          pageKey: ALL,
          appOpens: 1,
          pageViews: 0,
          pushOpens: 0,
          activeMinutes: 0,
        },
        {
          bucketHour: bucket,
          userId: "u1",
          entryChannel: "pwa",
          pageKey: "/app/patient/home",
          appOpens: 0,
          pageViews: 3,
          pushOpens: 0,
          activeMinutes: 0,
        },
        {
          bucketHour: bucket,
          userId: "u2",
          entryChannel: "browser",
          pageKey: ALL,
          appOpens: 1,
          pageViews: 0,
          pushOpens: 1,
          activeMinutes: 2,
        },
      ],
      warmupSloganSamples: [{ sloganKey: "s1", sampleText: "Разминка" }],
    });

    expect(dashboard.summary.totalAuthLogins).toBe(0);
    expect(dashboard.summary.totalAppOpens).toBe(4);
    expect(dashboard.summary.totalPageViews).toBe(5);
    expect(dashboard.summary.totalActiveMinutes).toBe(2);
    expect(dashboard.summary.totalPushSent).toBe(10);
    expect(dashboard.summary.totalPushOpens).toBe(2);
    expect(dashboard.summary.pushOpenRate).toBeCloseTo(0.2);
    expect(dashboard.summary.uniqueActiveUsers).toBe(2);

    expect(dashboard.entryChannelHourly).toEqual([
      { bucket, pwa: 3, telegram: 1, max: 0, browser: 0 },
    ]);

    expect(dashboard.topPages[0]).toEqual({
      pageKey: "/app/patient/home",
      views: 5,
      uniqueUsers: 1,
    });

    expect(dashboard.pushByTopic[0]).toMatchObject({
      topicCode: "warmup_reminder",
      sent: 10,
      opened: 2,
      openRate: 0.2,
    });

    expect(dashboard.warmupSlogans[0]).toMatchObject({
      sloganKey: "s1",
      sent: 10,
      opened: 2,
      sampleText: "Разминка",
    });

    expect(dashboard.activeUsersDaily).toEqual([{ day: "2026-05-20", activeUsers: 2 }]);
  });

  it("counts auth_login in summary", () => {
    const dashboard = buildAdminDashboard({
      windowHours: 24,
      startHourInclusive: startHour,
      hourlyRows: [
        {
          bucketHour: bucket,
          eventType: "auth_login",
          entryChannel: "browser",
          pageKey: ALL,
          topicCode: ALL,
          pushKind: ALL,
          warmupSloganKey: ALL,
          eventCount: 7,
        },
      ],
      userHourlyRows: [],
    });
    expect(dashboard.summary.totalAuthLogins).toBe(7);
  });

  it("excludes buckets before startHourInclusive", () => {
    const dashboard = buildAdminDashboard({
      windowHours: 24,
      startHourInclusive: startHour,
      hourlyRows: [
        {
          bucketHour: "2026-05-19T08:00:00.000Z",
          eventType: "app_open",
          entryChannel: "pwa",
          pageKey: ALL,
          topicCode: ALL,
          pushKind: ALL,
          warmupSloganKey: ALL,
          eventCount: 99,
        },
      ],
      userHourlyRows: [],
    });
    expect(dashboard.summary.totalAppOpens).toBe(0);
    expect(dashboard.entryChannelHourly).toEqual([]);
  });
});
