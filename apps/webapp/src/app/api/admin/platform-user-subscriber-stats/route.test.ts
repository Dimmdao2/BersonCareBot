import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminModeSessionMock, getSubscriberStatsMock, loadDoctorAnalyticsAudienceMock } = vi.hoisted(() => ({
  requireAdminModeSessionMock: vi.fn(),
  getSubscriberStatsMock: vi.fn(),
  loadDoctorAnalyticsAudienceMock: vi.fn(),
}));

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: () => Promise.resolve("Europe/Moscow"),
}));

vi.mock("@/app-layer/analytics/loadAnalyticsAudience", () => ({
  loadDoctorAnalyticsAudience: loadDoctorAnalyticsAudienceMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    adminPlatformUserStats: {
      getSubscriberStats: getSubscriberStatsMock,
    },
  }),
}));

import { GET } from "./route";

describe("GET /api/admin/platform-user-subscriber-stats", () => {
  beforeEach(() => {
    requireAdminModeSessionMock.mockReset();
    getSubscriberStatsMock.mockReset();
    loadDoctorAnalyticsAudienceMock.mockReset();
    loadDoctorAnalyticsAudienceMock.mockResolvedValue({ excludedUserIds: [] });
  });

  it("returns 403 when not admin", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const res = await GET(new Request("http://localhost/api/admin/platform-user-subscriber-stats"));
    expect(res.status).toBe(403);
  });

  it("returns 400 for custom without from/to", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    const res = await GET(new Request("http://localhost/api/admin/platform-user-subscriber-stats?preset=custom"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("custom_range_required");
  });

  it("returns 400 when from/to passed for non-custom preset", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    const res = await GET(
      new Request(
        "http://localhost/api/admin/platform-user-subscriber-stats?preset=week&from=2026-01-01&to=2026-01-02",
      ),
    );
    expect(res.status).toBe(400);
  });

  it("defaults omitted preset to week and returns payload", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    getSubscriberStatsMock.mockResolvedValue({
      iana: "Europe/Moscow",
      fromDay: "2026-05-10",
      toDay: "2026-05-16",
      startUtcIso: "2026-05-09T21:00:00.000Z",
      endExclusiveUtcIso: "2026-05-16T21:00:00.000Z",
      summary: { cumulativeEnd: 42, deltaInRange: 3 },
      series: [{ day: "2026-05-16", cumulativeSubscribers: 42 }],
    });
    const res = await GET(new Request("http://localhost/api/admin/platform-user-subscriber-stats"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; summary?: { cumulativeEnd: number } };
    expect(body.ok).toBe(true);
    expect(body.summary?.cumulativeEnd).toBe(42);
    expect(getSubscriberStatsMock).toHaveBeenCalledWith(
      expect.objectContaining({ preset: "week", iana: "Europe/Moscow" }),
    );
  });

  it("normalizes preset=today to week", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    getSubscriberStatsMock.mockResolvedValue({
      iana: "Europe/Moscow",
      fromDay: "x",
      toDay: "y",
      startUtcIso: "a",
      endExclusiveUtcIso: "b",
      summary: { cumulativeEnd: 0, deltaInRange: 0 },
      series: [],
    });
    await GET(new Request("http://localhost/api/admin/platform-user-subscriber-stats?preset=today"));
    expect(getSubscriberStatsMock).toHaveBeenCalledWith(expect.objectContaining({ preset: "week" }));
  });
});
