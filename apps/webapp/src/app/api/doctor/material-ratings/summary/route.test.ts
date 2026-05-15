import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const listDoctorSummaryMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    materialRating: { listDoctorSummary: listDoctorSummaryMock },
  }),
}));

import { GET } from "./route";

describe("GET /api/doctor/material-ratings/summary", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    listDoctorSummaryMock.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/doctor/material-ratings/summary"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for client role", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "u1", role: "client", bindings: {} } });
    const res = await GET(new Request("http://localhost/api/doctor/material-ratings/summary"));
    expect(res.status).toBe(403);
  });

  it("returns rows for doctor with default pagination", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    listDoctorSummaryMock.mockResolvedValue([
      {
        targetKind: "content_page",
        targetId: "550e8400-e29b-41d4-a716-446655440099",
        avg: 4,
        count: 2,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 0 },
      },
    ]);
    const res = await GET(new Request("http://localhost/api/doctor/material-ratings/summary"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.rows).toHaveLength(1);
    expect(listDoctorSummaryMock).toHaveBeenCalledWith({ targetKind: undefined, limit: 100, offset: 0 });
  });

  it("passes kind limit offset from query", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    listDoctorSummaryMock.mockResolvedValue([]);
    await GET(
      new Request(
        "http://localhost/api/doctor/material-ratings/summary?kind=lfk_exercise&limit=50&offset=10",
      ),
    );
    expect(listDoctorSummaryMock).toHaveBeenCalledWith({
      targetKind: "lfk_exercise",
      limit: 50,
      offset: 10,
    });
  });
});
