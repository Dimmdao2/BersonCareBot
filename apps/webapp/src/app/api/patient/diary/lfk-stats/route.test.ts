import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { gateMock, buildAppDepsMock, getComplexMock, listComplexesMock, listRangeMock } = vi.hoisted(() => {
  const gateMockInner = vi.fn();
  const getComplexMockInner = vi.fn();
  const listComplexesMockInner = vi.fn();
  const listRangeMockInner = vi.fn();
  return {
    gateMock: gateMockInner,
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
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiSessionWithPhone: gateMock,
}));

import { GET } from "./route";

function okClient(userId: string) {
  return {
    ok: true as const,
    session: { user: { userId, role: "client" as const, phone: "+79990001122", bindings: {} } },
  };
}

describe("GET /api/patient/diary/lfk-stats", () => {
  beforeEach(() => {
    gateMock.mockReset();
    getComplexMock.mockReset();
    listComplexesMock.mockReset();
    listRangeMock.mockReset();
  });

  it("returns 401 without session", async () => {
    gateMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await GET(new Request("http://localhost/api/patient/diary/lfk-stats?period=week&offset=0"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when logged in as non-patient", async () => {
    gateMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await GET(new Request("http://localhost/api/patient/diary/lfk-stats?period=week&offset=0"));
    expect(res.status).toBe(401);
  });

  it("returns 404 for foreign complexId", async () => {
    gateMock.mockResolvedValue(okClient("u1"));
    listComplexesMock.mockResolvedValue([]);
    getComplexMock.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/patient/diary/lfk-stats?complexId=c-other&period=week&offset=0"),
    );
    expect(res.status).toBe(404);
  });

  it("returns overview without complexId", async () => {
    gateMock.mockResolvedValue(okClient("u1"));
    listComplexesMock.mockResolvedValue([
      { id: "c1", title: "A", userId: "u1", origin: "manual", isActive: true, createdAt: "", updatedAt: "" },
    ]);
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
    gateMock.mockResolvedValue(okClient("u1"));
    listComplexesMock.mockResolvedValue([
      { id: "c1", title: "A", userId: "u1", origin: "manual", isActive: true, createdAt: "", updatedAt: "" },
    ]);
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
      new Request("http://localhost/api/patient/diary/lfk-stats?complexId=c1&period=week&offset=0"),
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
