import { describe, expect, it } from "vitest";
import type { IntegratorPushOutboxHealthSnapshot } from "@/modules/operator-health/ports";
import type { SystemHealthResponse } from "./collectAdminSystemHealthData";
import { ADMIN_DELIVERY_DUE_BACKLOG_WARNING } from "@/modules/operator-health/adminHealthThresholds";
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
    probeOutbound: { consecutiveFailRuns: 0 },
    ...overrides,
  } as SystemHealthResponse;
}

describe("adminDoctorTodayHealthBannerFromSystemHealth", () => {
  it("does not show banner for mediaPreview/videoPlayback errors alone", () => {
    const banner = adminDoctorTodayHealthBannerFromSystemHealth(healthyShell());
    expect(banner).toEqual({ show: false });
  });

  it("shows banner for due backlog without dead", () => {
    const banner = adminDoctorTodayHealthBannerFromSystemHealth(
      healthyShell({
        outgoingDelivery: {
          deadTotal: 0,
          dueBacklog: ADMIN_DELIVERY_DUE_BACKLOG_WARNING,
        } as SystemHealthResponse["outgoingDelivery"],
      }),
    );
    expect(banner.show).toBe(true);
  });

  it("shows banner when integrator API is unreachable", () => {
    const banner = adminDoctorTodayHealthBannerFromSystemHealth(
      healthyShell({ integratorApi: { status: "unreachable" } }),
    );
    expect(banner.show).toBe(true);
  });

  it("shows banner for probe 3-strike from probeOutbound field", () => {
    const banner = adminDoctorTodayHealthBannerFromSystemHealth(
      healthyShell({ probeOutbound: { consecutiveFailRuns: 3 } }),
    );
    expect(banner.show).toBe(true);
  });

  it("shows banner for video transcode error", () => {
    const banner = adminDoctorTodayHealthBannerFromSystemHealth(
      healthyShell({
        videoTranscode: { status: "error" } as SystemHealthResponse["videoTranscode"],
      }),
    );
    expect(banner.show).toBe(true);
  });

  it("tolerates missing probeOutbound (legacy partial snapshots)", () => {
    const shell = healthyShell();
    delete (shell as { probeOutbound?: { consecutiveFailRuns: number } }).probeOutbound;
    expect(adminDoctorTodayHealthBannerFromSystemHealth(shell)).toEqual({ show: false });
  });
});
