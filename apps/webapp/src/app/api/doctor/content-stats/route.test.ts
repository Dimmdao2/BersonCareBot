import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const loadContentEngagementStatsMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
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
  reminderRulesEnabledCount: 5,
  occurrenceHistoryHourly: [] as Array<{ bucket: string; sent: number; failed: number }>,
  occurrenceHistoryDaily: [] as Array<{ bucket: string; sent: number; failed: number }>,
  journalByAction: { done: 1, skipped: 0, snoozed: 0 },
  journalSkipReasonsTop: [] as Array<{ reason: string; count: number }>,
  practiceBySource: {} as Record<string, number>,
  practiceTopPages: [] as Array<{ contentPageId: string; section: string; slug: string; count: number }>,
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
    getSessionMock.mockReset();
    loadContentEngagementStatsMock.mockReset();
    loadContentEngagementStatsMock.mockResolvedValue(samplePayload);
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/doctor/content-stats"));
    expect(res.status).toBe(401);
    expect(loadContentEngagementStatsMock).not.toHaveBeenCalled();
  });

  it("returns 403 for client role", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "u1", role: "client", bindings: {} } });
    const res = await GET(new Request("http://localhost/api/doctor/content-stats"));
    expect(res.status).toBe(403);
    expect(loadContentEngagementStatsMock).not.toHaveBeenCalled();
  });

  it("returns JSON for doctor with windowHours from query", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await GET(new Request("http://localhost/api/doctor/content-stats?windowHours=720"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof samplePayload;
    expect(body.reminderRulesEnabledCount).toBe(5);
    expect(loadContentEngagementStatsMock).toHaveBeenCalledWith({ windowHours: 720 });
  });

  it("returns JSON for admin role without admin mode", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await GET(new Request("http://localhost/api/doctor/content-stats?windowHours=168"));
    expect(res.status).toBe(200);
    expect(loadContentEngagementStatsMock).toHaveBeenCalledWith({ windowHours: 168 });
  });
});
