import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminModeSessionMock, loadAdminProductAnalyticsMock } = vi.hoisted(() => ({
  requireAdminModeSessionMock: vi.fn(),
  loadAdminProductAnalyticsMock: vi.fn(),
}));

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

vi.mock("@/app-layer/product-analytics/loadAdminProductAnalytics", () => ({
  loadAdminProductAnalytics: loadAdminProductAnalyticsMock,
}));

import { GET } from "./route";

const samplePayload = {
  windowHours: 168,
  displayTimezone: "Europe/Moscow",
  generatedAt: "2026-05-27T12:00:00.000Z",
  summary: {
    uniqueActiveUsers: 2,
    totalAuthLogins: 0,
    totalAppOpens: 4,
    totalPageViews: 5,
    totalActiveMinutes: 0,
    totalPushSent: 4,
    totalPushOpens: 1,
    pushOpenRate: 0.25,
  },
  entryChannelHourly: [],
  entryChannelTotals: [],
  topPages: [],
  pageViewsHourly: [],
  pushByTopic: [],
  warmupSlogans: [],
  activeUsersDaily: [],
  clientActivity: [],
};

describe("GET /api/admin/product-analytics", () => {
  beforeEach(() => {
    requireAdminModeSessionMock.mockReset();
    loadAdminProductAnalyticsMock.mockReset();
    loadAdminProductAnalyticsMock.mockResolvedValue(samplePayload);
  });

  it("returns 403 when not admin mode", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const res = await GET(new Request("http://localhost/api/admin/product-analytics"));
    expect(res.status).toBe(403);
    expect(loadAdminProductAnalyticsMock).not.toHaveBeenCalled();
  });

  it("returns JSON dashboard for admin mode", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    const res = await GET(
      new Request("http://localhost/api/admin/product-analytics?windowHours=48"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof samplePayload;
    expect(body.summary.uniqueActiveUsers).toBe(2);
    expect(loadAdminProductAnalyticsMock).toHaveBeenCalledWith({ windowHours: 48 });
  });
});
