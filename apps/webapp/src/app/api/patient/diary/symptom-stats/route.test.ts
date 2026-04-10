import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { gateMock, buildAppDepsMock, getTrackingMock, listRangeMock } = vi.hoisted(() => {
  const gateMockInner = vi.fn();
  const getTrackingMockInner = vi.fn();
  const listRangeMockInner = vi.fn();
  return {
    gateMock: gateMockInner,
    getTrackingMock: getTrackingMockInner,
    listRangeMock: listRangeMockInner,
    buildAppDepsMock: vi.fn(() => ({
      diaries: {
        getSymptomTrackingForUser: getTrackingMockInner,
        listSymptomEntriesForTrackingInRange: listRangeMockInner,
        minRecordedAtForSymptomTracking: vi.fn().mockResolvedValue(null),
      },
    })),
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: gateMock,
}));

import { GET } from "./route";

function okClient(userId: string) {
  return {
    ok: true as const,
    session: { user: { userId, role: "client" as const, phone: "+79990001122", bindings: {} } },
  };
}

describe("GET /api/patient/diary/symptom-stats", () => {
  beforeEach(() => {
    gateMock.mockReset();
    getTrackingMock.mockReset();
    listRangeMock.mockReset();
  });

  it("returns 401 without session", async () => {
    gateMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await GET(
      new Request("http://localhost/api/patient/diary/symptom-stats?trackingId=t1&period=week&offset=0"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when logged in as non-patient", async () => {
    gateMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await GET(
      new Request("http://localhost/api/patient/diary/symptom-stats?trackingId=tr-1&period=week&offset=0"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when tracking is not owned by user", async () => {
    gateMock.mockResolvedValue(okClient("u1"));
    getTrackingMock.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/patient/diary/symptom-stats?trackingId=other-tracking&period=week&offset=0"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with points for owned tracking", async () => {
    gateMock.mockResolvedValue(okClient("u1"));
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
      new Request("http://localhost/api/patient/diary/symptom-stats?trackingId=tr-1&period=month&offset=0"),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      points: { date: string; instant: number | null; daily: number | null }[];
      period: string;
    };
    expect(data.ok).toBe(true);
    expect(data.period).toBe("month");
    expect(data.points.some((p) => p.date === "2025-03-01" && p.instant === 4 && p.daily === null)).toBe(true);
  });

  it("returns 400 for invalid period", async () => {
    gateMock.mockResolvedValue(okClient("u1"));
    const res = await GET(
      new Request("http://localhost/api/patient/diary/symptom-stats?trackingId=tr-1&period=invalid"),
    );
    expect(res.status).toBe(400);
  });
});
