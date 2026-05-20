import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

const mockLoadPatientHomeProgressForUser = vi.hoisted(() => vi.fn());
const mockGetSetting = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    systemSettings: { getSetting: mockGetSetting },
  }),
}));

vi.mock("@/modules/patient-home/patientHomeProgressResolver", () => ({
  loadPatientHomeProgressForUser: mockLoadPatientHomeProgressForUser,
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
    mockGetSetting.mockResolvedValue({ valueJson: { value: 4 } });
    mockLoadPatientHomeProgressForUser.mockResolvedValue({ todayDone: 2, todayTarget: 4, streak: 1 });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns progress json from home progress resolver", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ todayDone: 2, todayTarget: 4, streak: 1 });
    expect(mockLoadPatientHomeProgressForUser).toHaveBeenCalledWith(
      expect.objectContaining({ systemSettings: { getSetting: mockGetSetting } }),
      SESSION.user.userId,
      "Europe/Moscow",
      4,
    );
  });
});
