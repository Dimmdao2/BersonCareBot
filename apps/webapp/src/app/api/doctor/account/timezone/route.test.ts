import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { requireDoctorApiSessionMock, getDoctorAccountTimezoneMock, setDoctorAccountTimezoneMock } = vi.hoisted(() => ({
  requireDoctorApiSessionMock: vi.fn(),
  getDoctorAccountTimezoneMock: vi.fn(),
  setDoctorAccountTimezoneMock: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorApiSession: requireDoctorApiSessionMock,
}));

vi.mock("@/app-layer/doctor/accountTimezone", () => ({
  getDoctorAccountTimezone: getDoctorAccountTimezoneMock,
  setDoctorAccountTimezone: setDoctorAccountTimezoneMock,
}));

import { GET, PATCH } from "./route";

const sessionOk = {
  ok: true as const,
  session: {
    user: { userId: "00000000-0000-4000-8000-000000000011", role: "doctor" as const, bindings: {} },
  },
};

describe("doctor account timezone route", () => {
  beforeEach(() => {
    requireDoctorApiSessionMock.mockReset();
    getDoctorAccountTimezoneMock.mockReset();
    setDoctorAccountTimezoneMock.mockReset();
    requireDoctorApiSessionMock.mockResolvedValue(sessionOk);
  });

  it("GET returns stored timezone", async () => {
    getDoctorAccountTimezoneMock.mockResolvedValue("Europe/Moscow");

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, timezone: "Europe/Moscow" });
    expect(getDoctorAccountTimezoneMock).toHaveBeenCalledWith(sessionOk.session.user.userId);
  });

  it("PATCH stores valid timezone", async () => {
    const res = await PATCH(
      new NextRequest("http://localhost/api/doctor/account/timezone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: "Europe/Samara" }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(setDoctorAccountTimezoneMock).toHaveBeenCalledWith(sessionOk.session.user.userId, "Europe/Samara");
  });

  it("PATCH rejects invalid timezone", async () => {
    const res = await PATCH(
      new NextRequest("http://localhost/api/doctor/account/timezone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: "not-a-zone" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(setDoctorAccountTimezoneMock).not.toHaveBeenCalled();
  });
});
