import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  refreshMock,
  buildAppDepsMock,
} = vi.hoisted(() => {
  const refreshMockInner = vi.fn();
  return {
    getSessionMock: vi.fn(),
    refreshMock: refreshMockInner,
    buildAppDepsMock: vi.fn(() => ({})),
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({ buildAppDeps: buildAppDepsMock }));
vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/treatment-program/refreshDefaultPromoPrograms", () => ({
  refreshDefaultPromoPrograms: refreshMock,
}));

import { POST } from "./route";

const TEMPLATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("POST /api/doctor/treatment-program-promo/refresh", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    refreshMock.mockReset();
  });

  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 403 for client role", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "u1", role: "client", bindings: {} } });
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("returns refreshed count for doctor", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    refreshMock.mockResolvedValue({ templateId: TEMPLATE_ID, refreshedCount: 3, pairs: [] });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, templateId: TEMPLATE_ID, refreshedCount: 3 });
    expect(refreshMock).toHaveBeenCalledWith(expect.anything(), "d1");
  });

  it("returns 400 when promo is not configured", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    refreshMock.mockRejectedValue(new Error("Промо-программа не настроена"));
    const res = await POST();
    expect(res.status).toBe(400);
  });
});
