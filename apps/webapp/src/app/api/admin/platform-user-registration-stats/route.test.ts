import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminModeSessionMock, getRegistrationStatsMock } = vi.hoisted(() => ({
  requireAdminModeSessionMock: vi.fn(),
  getRegistrationStatsMock: vi.fn(),
}));

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: () => Promise.resolve("Europe/Moscow"),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    adminPlatformUserStats: {
      getRegistrationStats: getRegistrationStatsMock,
    },
  }),
}));

import { GET } from "./route";

describe("GET /api/admin/platform-user-registration-stats", () => {
  beforeEach(() => {
    requireAdminModeSessionMock.mockReset();
    getRegistrationStatsMock.mockReset();
  });

  it("returns 403 when not admin", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const res = await GET(new Request("http://localhost/api/admin/platform-user-registration-stats"));
    expect(res.status).toBe(403);
  });

  it("returns 400 for custom without from/to", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    const res = await GET(
      new Request("http://localhost/api/admin/platform-user-registration-stats?preset=custom"),
    );
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
        "http://localhost/api/admin/platform-user-registration-stats?preset=today&from=2026-01-01&to=2026-01-02",
      ),
    );
    expect(res.status).toBe(400);
  });

  it("returns stats payload when authorized (default preset = week)", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    getRegistrationStatsMock.mockResolvedValue({
      iana: "Europe/Moscow",
      fromDay: "2026-05-10",
      toDay: "2026-05-16",
      startUtcIso: "2026-05-09T21:00:00.000Z",
      endExclusiveUtcIso: "2026-05-16T21:00:00.000Z",
      summary: { registrations: 2, merges: 1, combined: 3 },
      series: [{ day: "2026-05-16", registrations: 2, merges: 1 }],
    });
    const res = await GET(new Request("http://localhost/api/admin/platform-user-registration-stats"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; summary?: { combined: number } };
    expect(body.ok).toBe(true);
    expect(body.summary?.combined).toBe(3);
    expect(getRegistrationStatsMock).toHaveBeenCalledWith(
      expect.objectContaining({ preset: "week", iana: "Europe/Moscow" }),
    );
  });

  it("normalizes preset=today query to week", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    getRegistrationStatsMock.mockResolvedValue({
      iana: "Europe/Moscow",
      fromDay: "x",
      toDay: "y",
      startUtcIso: "a",
      endExclusiveUtcIso: "b",
      summary: { registrations: 0, merges: 0, combined: 0 },
      series: [],
    });
    await GET(new Request("http://localhost/api/admin/platform-user-registration-stats?preset=today"));
    expect(getRegistrationStatsMock).toHaveBeenCalledWith(expect.objectContaining({ preset: "week" }));
  });

  it("returns 400 range_too_short when service rejects", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    getRegistrationStatsMock.mockRejectedValue(new Error("range_too_short"));
    const res = await GET(
      new Request(
        "http://localhost/api/admin/platform-user-registration-stats?preset=custom&from=2026-01-01&to=2026-01-07",
      ),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.error).toBe("range_too_short");
  });
});
