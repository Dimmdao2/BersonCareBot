import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

const mockGetIana = vi.hoisted(() => vi.fn());
const mockTrySetInitial = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientCalendarTimezone: {
      getIanaForUser: mockGetIana,
      setIanaForPatient: vi.fn(),
      trySetInitialIfEmpty: mockTrySetInitial,
    },
  }),
}));

const mockGetAppDisplayTimeZone = vi.hoisted(() => vi.fn().mockResolvedValue("Europe/Moscow"));
vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: mockGetAppDisplayTimeZone,
}));

vi.mock("@/shared/timezone/formatIanaUtcOffsetPlaceholder", () => ({
  formatIanaUtcOffsetPlaceholder: (iana: string) => `(stub) ${iana}`,
}));

import { GET, POST } from "./route";

const SESSION = {
  user: { userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "client" as const, phone: "+79990001122" },
};

describe("/api/patient/profile/calendar-timezone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: SESSION });
    mockGetIana.mockResolvedValue(null);
  });

  it("GET returns null calendarTimezone and placeholder", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      ok: true,
      calendarTimezone: null,
      appDefaultTimezonePlaceholder: "(stub) Europe/Moscow",
    });
  });

  it("POST calls trySetInitialIfEmpty with trimmed IANA", async () => {
    const req = new Request("http://localhost/api/patient/profile/calendar-timezone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ browserCalendarIana: "  Europe/Berlin  " }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockTrySetInitial).toHaveBeenCalledWith(SESSION.user.userId, "Europe/Berlin");
  });

  it("POST passes null when browserCalendarIana missing", async () => {
    const req = new Request("http://localhost/api/patient/profile/calendar-timezone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockTrySetInitial).toHaveBeenCalledWith(SESSION.user.userId, null);
  });

  it("POST returns 401 when gate fails", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const req = new Request("http://localhost/api/patient/profile/calendar-timezone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ browserCalendarIana: "Europe/Moscow" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockTrySetInitial).not.toHaveBeenCalled();
  });
});
