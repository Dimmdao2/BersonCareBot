import { describe, expect, it, vi } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const getCalendarMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingCalendar: { getCalendar: getCalendarMock },
    systemSettings: {
      getSetting: vi.fn().mockResolvedValue({ valueJson: { value: "Europe/Moscow" } }),
    },
  }),
}));

vi.mock("@/app-layer/booking/resolveDoctorCalendarIana", () => ({
  resolveDoctorCalendarIana: vi.fn().mockResolvedValue("Europe/Moscow"),
}));

import { GET } from "./route";

describe("GET /api/doctor/booking-engine/calendar", () => {
  it("returns calendar aggregate when authorized", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1", session: { user: { userId: "doctor-1" } } },
    });
    getCalendarMock.mockResolvedValue({
      events: [],
      readSource: "canonical",
      showWorkingHours: true,
      filters: { specialists: [], branches: [], rooms: [], services: [] },
    });

    const res = await GET(
      new Request("http://localhost/api/doctor/booking-engine/calendar?date=2026-05-01&view=day"),
    );
    const json = (await res.json()) as {
      ok?: boolean;
      events?: unknown[];
      readSource?: string;
      showWorkingHours?: boolean;
    };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.readSource).toBe("canonical");
    expect(json.showWorkingHours).toBe(true);
    expect(getCalendarMock).toHaveBeenCalled();
  });

  it("returns gate response when unauthorized", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const res = await GET(
      new Request("http://localhost/api/doctor/booking-engine/calendar?date=2026-05-01&view=day"),
    );
    expect(res.status).toBe(403);
  });
});
