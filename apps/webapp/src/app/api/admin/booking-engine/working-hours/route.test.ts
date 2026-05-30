import { describe, expect, it, vi, beforeEach } from "vitest";

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireAdminBookingEngine", () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

const listWorkingHoursAdminMock = vi.hoisted(() => vi.fn());
const usesWorkingHoursFallbackMock = vi.hoisted(() => vi.fn());
const createWorkingHoursMock = vi.hoisted(() => vi.fn());
const updateWorkingHoursMock = vi.hoisted(() => vi.fn());
const deactivateWorkingHoursMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingScheduling: {
      listWorkingHoursAdmin: listWorkingHoursAdminMock,
      usesWorkingHoursFallback: usesWorkingHoursFallbackMock,
      createWorkingHours: createWorkingHoursMock,
      updateWorkingHours: updateWorkingHoursMock,
      deactivateWorkingHours: deactivateWorkingHoursMock,
    },
  }),
}));

import { GET, POST, PATCH, DELETE } from "./route";

describe("/api/admin/booking-engine/working-hours", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("POST rejects startMinute >= endMinute", async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1" },
    });

    const res = await POST(
      new Request("http://localhost/api/admin/booking-engine/working-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekday: 1, startMinute: 600, endMinute: 540 }),
      }),
    );
    expect(res.status).toBe(400);
    expect(createWorkingHoursMock).not.toHaveBeenCalled();
  });

  it("PATCH updates working hours row", async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1" },
    });
    updateWorkingHoursMock.mockResolvedValue({ id: "wh-1" });

    const res = await PATCH(
      new Request("http://localhost/api/admin/booking-engine/working-hours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", startMinute: 540, endMinute: 1020 }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateWorkingHoursMock).toHaveBeenCalled();
  });

  it("DELETE deactivates working hours row", async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1" },
    });

    const res = await DELETE(
      new Request("http://localhost/api/admin/booking-engine/working-hours?id=11111111-1111-4111-8111-111111111111"),
    );
    expect(res.status).toBe(200);
    expect(deactivateWorkingHoursMock).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "org-1",
    );
  });
});
