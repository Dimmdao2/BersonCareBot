import { describe, expect, it, vi } from "vitest";

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireAdminBookingEngine", () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

const listWorkingHoursAdminMock = vi.hoisted(() => vi.fn());
const usesWorkingHoursFallbackMock = vi.hoisted(() => vi.fn());
const createWorkingHoursMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingScheduling: {
      listWorkingHoursAdmin: listWorkingHoursAdminMock,
      usesWorkingHoursFallback: usesWorkingHoursFallbackMock,
      createWorkingHours: createWorkingHoursMock,
      updateWorkingHours: vi.fn(),
      deactivateWorkingHours: vi.fn(),
    },
  }),
}));

import { GET, POST } from "./route";

describe("/api/admin/booking-engine/working-hours", () => {
  it("GET returns rows and fallback flag", async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1" },
    });
    listWorkingHoursAdminMock.mockResolvedValue([]);
    usesWorkingHoursFallbackMock.mockResolvedValue(true);

    const res = await GET(new Request("http://localhost/api/admin/booking-engine/working-hours"));
    const json = (await res.json()) as { ok?: boolean; usesFallback?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.usesFallback).toBe(true);
  });

  it("POST creates working hours row", async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1" },
    });
    createWorkingHoursMock.mockResolvedValue({ id: "wh-1" });

    const res = await POST(
      new Request("http://localhost/api/admin/booking-engine/working-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekday: 1, startMinute: 540, endMinute: 1080 }),
      }),
    );
    expect(res.status).toBe(200);
    expect(createWorkingHoursMock).toHaveBeenCalled();
  });
});
