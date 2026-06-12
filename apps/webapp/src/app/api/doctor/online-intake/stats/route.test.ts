import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const getDoctorStatsMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ total: 5, byStatus: {} }),
);

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/onlineIntakeDeps", () => ({
  getOnlineIntakeService: () => ({
    getDoctorStats: getDoctorStatsMock,
  }),
}));

import { GET } from "./route";

function call(url: string) {
  return GET(new Request(url));
}

describe("GET /api/doctor/online-intake/stats", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
    getDoctorStatsMock.mockClear();
  });

  it("401 без сессии", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const res = await call("http://localhost/api/doctor/online-intake/stats");
    expect(res.status).toBe(401);
    expect(getDoctorStatsMock).not.toHaveBeenCalled();
  });

  it("403 для пациента (client)", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client", bindings: {} },
    });
    const res = await call("http://localhost/api/doctor/online-intake/stats");
    expect(res.status).toBe(403);
    expect(getDoctorStatsMock).not.toHaveBeenCalled();
  });

  it("использует days=30 по умолчанию", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    const res = await call("http://localhost/api/doctor/online-intake/stats");
    expect(res.status).toBe(200);
    expect(getDoctorStatsMock).toHaveBeenCalledWith(30);
    const body = (await res.json()) as { ok: boolean; stats: unknown };
    expect(body.ok).toBe(true);
    expect(body.stats).toEqual({ total: 5, byStatus: {} });
  });

  it("принимает разрешённые окна (7/30/90/365)", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    await call("http://localhost/api/doctor/online-intake/stats?days=90");
    expect(getDoctorStatsMock).toHaveBeenCalledWith(90);
  });

  it("откатывает невалидное окно к 30", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    await call("http://localhost/api/doctor/online-intake/stats?days=999");
    expect(getDoctorStatsMock).toHaveBeenCalledWith(30);

    getDoctorStatsMock.mockClear();
    await call("http://localhost/api/doctor/online-intake/stats?days=abc");
    expect(getDoctorStatsMock).toHaveBeenCalledWith(30);
  });
});
