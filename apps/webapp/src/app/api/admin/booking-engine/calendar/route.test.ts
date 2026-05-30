import { describe, expect, it, vi } from "vitest";

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const getCalendarMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireAdminBookingEngine", () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingCalendar: { getCalendar: getCalendarMock },
    systemSettings: {
      getSetting: vi.fn().mockResolvedValue({ valueJson: { value: "Europe/Moscow" } }),
    },
  }),
}));

import { GET } from "./route";

describe("GET /api/admin/booking-engine/calendar", () => {
  it("returns calendar aggregate when authorized", async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1" },
    });
    getCalendarMock.mockResolvedValue({
      events: [
        {
          kind: "appointment",
          id: "legacy-1",
          source: "rubitime_legacy",
          startAt: "2026-05-01T10:00:00.000Z",
          endAt: "2026-05-01T11:00:00.000Z",
        },
      ],
      freeSlots: [],
      readSource: "rubitime_legacy",
      freeSlotsEnabled: false,
    });

    const res = await GET(
      new Request("http://localhost/api/admin/booking-engine/calendar?date=2026-05-01&view=day"),
    );
    const json = (await res.json()) as {
      ok?: boolean;
      readSource?: string;
      freeSlotsEnabled?: boolean;
      events?: { source?: string }[];
    };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.readSource).toBe("rubitime_legacy");
    expect(json.freeSlotsEnabled).toBe(false);
    expect(json.events?.[0]?.source).toBe("rubitime_legacy");
    expect(getCalendarMock).toHaveBeenCalled();
  });
});
