import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, buildAppDepsMock, getTrackingMock, listRangeMock } = vi.hoisted(() => {
  const getSessionMockInner = vi.fn();
  const getTrackingMockInner = vi.fn();
  const listRangeMockInner = vi.fn();
  return {
    getSessionMock: getSessionMockInner,
    getTrackingMock: getTrackingMockInner,
    listRangeMock: listRangeMockInner,
    buildAppDepsMock: vi.fn(() => ({
      diaries: {
        getSymptomTrackingForUser: getTrackingMockInner,
        listSymptomEntriesForTrackingInRange: listRangeMockInner,
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

describe("GET /api/patient/diary/symptom-stats", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getTrackingMock.mockReset();
    listRangeMock.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/patient/diary/symptom-stats?trackingId=t1&period=week&offset=0")
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when logged in as non-patient", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    const res = await GET(
      new Request("http://localhost/api/patient/diary/symptom-stats?trackingId=tr-1&period=week&offset=0")
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when tracking is not owned by user", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client", bindings: {} },
    });
    getTrackingMock.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/patient/diary/symptom-stats?trackingId=other-tracking&period=week&offset=0")
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with points for owned tracking", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client", bindings: {} },
    });
    getTrackingMock.mockResolvedValue({
      id: "tr-1",
      userId: "u1",
      symptomTitle: "S",
      symptomKey: null,
      isActive: true,
      createdAt: "",
      updatedAt: "",
    });
    listRangeMock.mockResolvedValue([
      {
        id: "e1",
        userId: "u1",
        trackingId: "tr-1",
        value0_10: 4,
        entryType: "instant",
        recordedAt: "2025-03-01T12:00:00.000Z",
        source: "webapp",
        notes: null,
        createdAt: "",
      },
    ]);
    const res = await GET(
      new Request("http://localhost/api/patient/diary/symptom-stats?trackingId=tr-1&period=month&offset=0")
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      points: { date: string; value: number }[];
      period: string;
    };
    expect(data.ok).toBe(true);
    expect(data.period).toBe("month");
    expect(data.points.some((p) => p.date === "2025-03-01" && p.value === 4)).toBe(true);
  });

  it("returns 400 for invalid period", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client", bindings: {} },
    });
    const res = await GET(
      new Request("http://localhost/api/patient/diary/symptom-stats?trackingId=tr-1&period=invalid")
    );
    expect(res.status).toBe(400);
  });
});
