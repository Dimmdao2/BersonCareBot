import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, buildAppDepsMock, getComplexMock, listComplexesMock, listRangeMock } = vi.hoisted(() => {
  const getSessionMockInner = vi.fn();
  const getComplexMockInner = vi.fn();
  const listComplexesMockInner = vi.fn();
  const listRangeMockInner = vi.fn();
  return {
    getSessionMock: getSessionMockInner,
    getComplexMock: getComplexMockInner,
    listComplexesMock: listComplexesMockInner,
    listRangeMock: listRangeMockInner,
    buildAppDepsMock: vi.fn(() => ({
      diaries: {
        getLfkComplexForUser: getComplexMockInner,
        listLfkComplexes: listComplexesMockInner,
        listLfkSessionsInRange: listRangeMockInner,
        minCompletedAtForLfkUser: vi.fn().mockResolvedValue(null),
      },
    })),
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getSessionMock,
}));

import { GET } from "./route";

describe("GET /api/patient/diary/lfk-stats", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getComplexMock.mockReset();
    listComplexesMock.mockReset();
    listRangeMock.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/patient/diary/lfk-stats?period=week&offset=0"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when logged in as non-patient", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    const res = await GET(new Request("http://localhost/api/patient/diary/lfk-stats?period=week&offset=0"));
    expect(res.status).toBe(403);
  });

  it("returns 404 for foreign complexId", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client", bindings: {} },
    });
    listComplexesMock.mockResolvedValue([]);
    getComplexMock.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/patient/diary/lfk-stats?complexId=c-other&period=week&offset=0")
    );
    expect(res.status).toBe(404);
  });

  it("returns overview without complexId", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client", bindings: {} },
    });
    listComplexesMock.mockResolvedValue([{ id: "c1", title: "A", userId: "u1", origin: "manual", isActive: true, createdAt: "", updatedAt: "" }]);
    listRangeMock.mockResolvedValue([]);
    const res = await GET(new Request("http://localhost/api/patient/diary/lfk-stats?period=week&offset=0"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; overview: { days: string[]; matrix: boolean[][] } | null };
    expect(data.ok).toBe(true);
    expect(data.overview).not.toBeNull();
    expect(Array.isArray(data.overview?.days)).toBe(true);
    const days = data.overview!.days;
    if (days.length >= 2) {
      for (let i = 1; i < days.length; i += 1) {
        expect(days[i - 1]! >= days[i]!).toBe(true);
      }
    }
  });

  it("returns detail with sessions when complexId owned", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client", bindings: {} },
    });
    listComplexesMock.mockResolvedValue([{ id: "c1", title: "A", userId: "u1", origin: "manual", isActive: true, createdAt: "", updatedAt: "" }]);
    getComplexMock.mockResolvedValue({
      id: "c1",
      userId: "u1",
      title: "A",
      origin: "manual",
      isActive: true,
      createdAt: "",
      updatedAt: "",
    });
    listRangeMock.mockResolvedValue([
      {
        id: "s1",
        userId: "u1",
        complexId: "c1",
        completedAt: "2025-03-01T10:00:00.000Z",
        source: "webapp",
        createdAt: "",
        durationMinutes: 5,
        difficulty0_10: 2,
        pain0_10: 1,
      },
    ]);
    const res = await GET(
      new Request("http://localhost/api/patient/diary/lfk-stats?complexId=c1&period=week&offset=0")
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      detail: { chartPoints: { date: string; value: number }[]; total: number } | null;
    };
    expect(data.ok).toBe(true);
    expect(data.detail?.total).toBe(1);
    expect(data.detail?.chartPoints.some((p) => p.date === "2025-03-01" && p.value >= 1)).toBe(true);
  });
});
