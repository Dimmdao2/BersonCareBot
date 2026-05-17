import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminModeSessionMock, loadAdminReminderStatsMock } = vi.hoisted(() => ({
  requireAdminModeSessionMock: vi.fn(),
  loadAdminReminderStatsMock: vi.fn(),
}));

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

vi.mock("@/app-layer/stats/loadAdminReminderStats", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/app-layer/stats/loadAdminReminderStats")>();
  return {
    ...mod,
    loadAdminReminderStats: loadAdminReminderStatsMock,
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
  occurrenceHistoryHourly: [] as Array<{ bucket: string; sent: number; failed: number }>,
  occurrenceHistoryDaily: [] as Array<{ bucket: string; sent: number; failed: number }>,
  journalByAction: { done: 1, skipped: 2, snoozed: 0 },
  journalSkipReasonsTop: [] as Array<{ reason: string; count: number }>,
  practiceBySource: { reminder: 3 } as Record<string, number>,
  practiceTopPages: [] as Array<{ contentPageId: string; section: string; slug: string; count: number }>,
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
    loadAdminReminderStatsMock.mockReset();
    loadAdminReminderStatsMock.mockResolvedValue(samplePayload);
  });

  it("returns 403 when not admin mode", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const res = await GET(new Request("http://localhost/api/admin/reminder-stats"));
    expect(res.status).toBe(403);
    expect(loadAdminReminderStatsMock).not.toHaveBeenCalled();
  });

  it("returns JSON from loadAdminReminderStats", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    const res = await GET(new Request("http://localhost/api/admin/reminder-stats?windowHours=48"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof samplePayload;
    expect(body.journalByAction.done).toBe(1);
    expect(loadAdminReminderStatsMock).toHaveBeenCalledWith({ windowHours: 48 });
  });
});
