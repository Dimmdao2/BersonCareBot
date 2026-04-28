import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

const mockGetToday = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientMood: { getToday: mockGetToday },
  }),
}));

const mockGetAppDisplayTimeZone = vi.hoisted(() => vi.fn().mockResolvedValue("Europe/Moscow"));
vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: mockGetAppDisplayTimeZone,
}));

import { GET } from "./route";

const SESSION = {
  user: { userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "client" as const, phone: "+79990001122" },
};

describe("GET /api/patient/mood/today", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: SESSION });
    mockGetToday.mockResolvedValue({ moodDate: "2026-04-28", score: 5 });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns today's mood", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, mood: { moodDate: "2026-04-28", score: 5 } });
    expect(mockGetAppDisplayTimeZone).toHaveBeenCalled();
    expect(mockGetToday).toHaveBeenCalledWith(SESSION.user.userId, "Europe/Moscow");
  });

  it("returns null mood when nothing is saved today", async () => {
    mockGetToday.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, mood: null });
  });
});
