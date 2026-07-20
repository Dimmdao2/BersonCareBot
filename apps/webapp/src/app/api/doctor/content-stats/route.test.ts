import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const loadDoctorAnalyticsAudienceMock = vi.hoisted(() => vi.fn());
const loadContentEngagementStatsMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));
vi.mock("@/app-layer/analytics/loadAnalyticsAudience", () => ({
  loadDoctorAnalyticsAudience: loadDoctorAnalyticsAudienceMock,
}));
vi.mock("@/app-layer/stats/loadAdminReminderStats", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/app-layer/stats/loadAdminReminderStats")>();
  return {
    ...mod,
    loadContentEngagementStats: loadContentEngagementStatsMock,
  };
});

import { GET } from "./route";

const samplePayload = {
  windowHours: 168,
  displayTimezone: "Europe/Moscow",
  reminderSendsLast24hClock: [],
  reminderRulesEnabledCount: 5,
  peopleWithNotifications: {
    currentPeopleCount: 5,
    daily: [],
    channelSegmentsToday: [],
  },
  occurrenceHistoryHourly: [] as Array<{ bucket: string; sent: number; failed: number }>,
  occurrenceHistoryDaily: [] as Array<{ bucket: string; sent: number; failed: number }>,
  pushOpensSummary: { opened: 3, sent: 10, openRate: 0.3 },
  pushOpensHourly: [{ bucket: "2026-05-01 00:00:00+00", opened: 3, sent: 10 }],
  pushOpensDaily: [{ bucket: "2026-05-01 00:00:00+00", opened: 3, sent: 10 }],
  practiceBySource: {} as Record<string, number>,
  practiceTopPages: [] as Array<{ contentPageId: string; section: string; slug: string; count: number }>,
  warmupVideoTopPages: [] as Array<{ contentPageId: string; section: string; slug: string; count: number }>,
  warmupVideoEstimatedWatchMinutes: 0,
  videoPlaybackEstimatedWatchMinutes: 0,
  videoPlayback: {
    byDelivery: { hls: 0, mp4: 0, file: 0 },
    fallbackTotal: 0,
    totalResolutions: 0,
    uniquePlaybackPairsFirstSeenInWindow: 0,
  },
  videoPlaybackClient: {
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
  },
};

describe("GET /api/doctor/content-stats", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "10000000-0000-4000-8000-000000000001" },
    });
    loadDoctorAnalyticsAudienceMock.mockReset();
    loadContentEngagementStatsMock.mockReset();
    loadDoctorAnalyticsAudienceMock.mockResolvedValue({ excludedUserIds: [] });
    loadContentEngagementStatsMock.mockResolvedValue(samplePayload);
  });

  it("returns 401 without session", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: Response.json({}, { status: 401 }),
    });
    const res = await GET(new Request("http://localhost/api/doctor/content-stats"));
    expect(res.status).toBe(401);
    expect(loadContentEngagementStatsMock).not.toHaveBeenCalled();
  });

  it("returns 403 for client role", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: Response.json({}, { status: 403 }),
    });
    const res = await GET(new Request("http://localhost/api/doctor/content-stats"));
    expect(res.status).toBe(403);
    expect(loadContentEngagementStatsMock).not.toHaveBeenCalled();
  });

  it("returns JSON for doctor with windowHours from query", async () => {
    const res = await GET(new Request("http://localhost/api/doctor/content-stats?windowHours=720"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof samplePayload;
    expect(body.peopleWithNotifications.currentPeopleCount).toBe(5);
    expect(loadContentEngagementStatsMock).toHaveBeenCalledWith({
      windowHours: 720,
      excludedUserIds: [],
    });
  });

  it("returns JSON for admin role without admin mode", async () => {
    const res = await GET(new Request("http://localhost/api/doctor/content-stats?windowHours=168"));
    expect(res.status).toBe(200);
    expect(loadContentEngagementStatsMock).toHaveBeenCalledWith({
      windowHours: 168,
      excludedUserIds: [],
    });
  });
});
