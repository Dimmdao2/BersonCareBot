import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminModeSessionMock, loadContentEngagementStatsMock, loadDoctorAnalyticsAudienceMock } = vi.hoisted(() => ({
  requireAdminModeSessionMock: vi.fn(),
  loadContentEngagementStatsMock: vi.fn(),
  loadDoctorAnalyticsAudienceMock: vi.fn(),
}));

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

vi.mock("@/app-layer/analytics/loadAnalyticsAudience", () => ({
  loadDoctorAnalyticsAudience: loadDoctorAnalyticsAudienceMock,
}));
vi.mock("@/app-layer/stats/loadAdminReminderStats", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/app-layer/stats/loadAdminReminderStats")>();
  return {
    ...mod,
    loadContentEngagementStats: loadContentEngagementStatsMock,
    loadAdminReminderStats: loadContentEngagementStatsMock,
  };
});

import { GET } from "./route";

const emptyPlaybackClient = (): {
  windowHours: number;
  totalErrors: number;
  totalErrorsLast1h: number;
  byEvent: Record<string, number>;
  byEventLast1h: Record<string, number>;
  byDelivery: { hls: number; mp4: number; file: number };
  recent: unknown[];
  likelyLooping: boolean;
} => ({
  windowHours: 24,
  totalErrors: 0,
  totalErrorsLast1h: 0,
  byEvent: {
    hls_fatal: 0,
    video_error: 0,
    hls_import_failed: 0,
    playback_refetch_failed: 0,
    playback_refetch_exception: 0,
    hls_js_unsupported: 0,
  },
  byEventLast1h: {
    hls_fatal: 0,
    video_error: 0,
    hls_import_failed: 0,
    playback_refetch_failed: 0,
    playback_refetch_exception: 0,
    hls_js_unsupported: 0,
  },
  byDelivery: { hls: 0, mp4: 0, file: 0 },
  recent: [],
  likelyLooping: false,
});

const samplePayload = {
  windowHours: 24,
  displayTimezone: "Europe/Moscow",
  reminderSendsLast24hClock: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    sent: 0,
    failed: 0,
  })),
  reminderRulesEnabledCount: 12,
  peopleWithNotifications: {
    currentPeopleCount: 27,
    daily: [{ bucket: "2026-05-27T00:00:00.000Z", peopleCount: 26 }],
    channelSegmentsToday: [
      { segment: "only_push" as const, label: "Только Push", peopleCount: 12 },
      { segment: "multiple" as const, label: "Несколько каналов", peopleCount: 8 },
    ],
  },
  occurrenceHistoryHourly: [] as Array<{ bucket: string; sent: number; failed: number }>,
  occurrenceHistoryDaily: [] as Array<{ bucket: string; sent: number; failed: number }>,
  pushOpensSummary: { opened: 1, sent: 4, openRate: 0.25 },
  pushOpensHourly: [] as Array<{ bucket: string; opened: number; sent: number }>,
  pushOpensDaily: [] as Array<{ bucket: string; opened: number; sent: number }>,
  practiceBySource: { reminder: 3 } as Record<string, number>,
  practiceTopPages: [] as Array<{ contentPageId: string; section: string; slug: string; count: number }>,
  warmupVideoTopPages: [] as Array<{ contentPageId: string; section: string; slug: string; count: number }>,
  warmupVideoEstimatedWatchMinutes: 0,
  videoPlaybackEstimatedWatchMinutes: 0,
  videoPlayback: {
    byDelivery: { hls: 1, mp4: 0, file: 0 },
    fallbackTotal: 0,
    totalResolutions: 1,
    uniquePlaybackPairsFirstSeenInWindow: 1,
  },
  videoPlaybackClient: emptyPlaybackClient(),
};

describe("GET /api/admin/reminder-stats", () => {
  beforeEach(() => {
    requireAdminModeSessionMock.mockReset();
    loadDoctorAnalyticsAudienceMock.mockReset();
    loadContentEngagementStatsMock.mockReset();
    loadDoctorAnalyticsAudienceMock.mockResolvedValue({ excludedUserIds: [] });
    loadContentEngagementStatsMock.mockResolvedValue(samplePayload);
  });

  it("returns 403 when not admin mode", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const res = await GET(new Request("http://localhost/api/admin/reminder-stats"));
    expect(res.status).toBe(403);
    expect(loadContentEngagementStatsMock).not.toHaveBeenCalled();
  });

  it("returns JSON from loadContentEngagementStats", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    const res = await GET(new Request("http://localhost/api/admin/reminder-stats?windowHours=48"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof samplePayload;
    expect(body.pushOpensSummary.opened).toBe(1);
    expect(body.peopleWithNotifications.currentPeopleCount).toBe(27);
    expect(loadContentEngagementStatsMock).toHaveBeenCalledWith({
      windowHours: 48,
      excludedUserIds: [],
    });
  });
});
