import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

const mockLoadMetrics = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({}),
}));

vi.mock("@/modules/patient-home/loadPatientHomeProgressMetrics", () => ({
  loadPatientHomeProgressMetrics: mockLoadMetrics,
}));

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: vi.fn().mockResolvedValue("Europe/Moscow"),
}));

import { GET } from "./route";

const SESSION = {
  user: { userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "client" as const, phone: "+79990001122" },
};

describe("GET /api/patient/practice/progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: SESSION });
    mockLoadMetrics.mockResolvedValue({
      warmupPlanned: 2,
      warmupDone: 1,
      trainingPlanned: 1,
      trainingDone: 1,
      streakDays: 2,
      doneTotal: 2,
      plannedTotal: 3,
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns five-metric progress json", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      todayDone: 2,
      todayTarget: 3,
      streak: 2,
      warmupPlanned: 2,
      warmupDone: 1,
      trainingPlanned: 1,
      trainingDone: 1,
    });
  });
});
