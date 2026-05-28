import { describe, expect, it } from "vitest";
import type { IntegratorPushOutboxHealthSnapshot } from "@/modules/operator-health/ports";
import type { SystemHealthResponse } from "./collectAdminSystemHealthData";
import { adminDoctorTodayHealthBannerFromSystemHealth } from "./adminDoctorTodayHealthBanner";

function emptyIntegratorPushOutbox(): IntegratorPushOutboxHealthSnapshot {
  return {
    dueBacklog: 0,
    deadTotal: 0,
    oldestDueAgeSeconds: null,
    dueByKind: {},
    deadByKind: {},
    processingCount: 0,
    oldestProcessingAgeSeconds: null,
    lastQueueActivityAt: null,
  };
}

function healthyShell(overrides: Partial<SystemHealthResponse> = {}): SystemHealthResponse {
  return {
    webappDb: "up",
    integratorApi: { status: "ok" },
    projection: { status: "ok" },
    mediaCronWorkers: { status: "configured" },
    mediaPreview: {
      status: "error",
      stalePendingCount: 99,
      byMimeAndStatus: {
        "video/quicktime": { pending: 0, ready: 0, failed: 0, skipped: 0 },
        "image/heic": { pending: 0, ready: 0, failed: 0, skipped: 0 },
        "image/heif": { pending: 0, ready: 0, failed: 0, skipped: 0 },
      },
    },
    videoPlayback: { status: "error" } as SystemHealthResponse["videoPlayback"],
    videoPlaybackClient: { status: "error" } as SystemHealthResponse["videoPlaybackClient"],
    videoHlsProxy: { status: "ok" } as SystemHealthResponse["videoHlsProxy"],
    videoTranscode: { status: "ok" } as SystemHealthResponse["videoTranscode"],
    operatorIncidentsOpen: [],
    backupJobs: {},
    outgoingDelivery: {
      deadTotal: 0,
      dueBacklog: 0,
    } as SystemHealthResponse["outgoingDelivery"],
    integratorPushOutbox: emptyIntegratorPushOutbox(),
    remindersPipeline: {} as SystemHealthResponse["remindersPipeline"],
    webPush: {} as SystemHealthResponse["webPush"],
    webPushOnlyReminderTick: { status: "ok", lastTick: null },
    notificationDelivery: {} as SystemHealthResponse["notificationDelivery"],
    cronJobs: { status: "ok", jobs: [] },
    ...overrides,
  } as SystemHealthResponse;
}

describe("adminDoctorTodayHealthBannerFromSystemHealth", () => {
  it("does not show banner for mediaPreview/videoPlayback errors alone", () => {
    const banner = adminDoctorTodayHealthBannerFromSystemHealth(healthyShell());
    expect(banner).toEqual({ show: false });
  });

  it("shows banner when integrator API is unreachable", () => {
    const banner = adminDoctorTodayHealthBannerFromSystemHealth(
      healthyShell({ integratorApi: { status: "unreachable" } }),
    );
    expect(banner.show).toBe(true);
  });
});
