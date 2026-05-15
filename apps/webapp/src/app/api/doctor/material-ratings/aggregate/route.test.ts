import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const getPublicAggregateMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    materialRating: { getPublicAggregate: getPublicAggregateMock },
  }),
}));

import { GET } from "./route";
import { MaterialRatingAccessError } from "@/modules/material-rating/types";

const UUID = "550e8400-e29b-41d4-a716-446655440099";

describe("GET /api/doctor/material-ratings/aggregate", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getPublicAggregateMock.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request(`http://localhost/api/doctor/material-ratings/aggregate?kind=content_page&id=${UUID}`));
    expect(res.status).toBe(401);
  });

  it("returns 403 for patient session", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "u1", role: "client", bindings: {} } });
    const res = await GET(new Request(`http://localhost/api/doctor/material-ratings/aggregate?kind=content_page&id=${UUID}`));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid query", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await GET(new Request(`http://localhost/api/doctor/material-ratings/aggregate?kind=bad&id=${UUID}`));
    expect(res.status).toBe(400);
  });

  it("returns aggregate for doctor", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    getPublicAggregateMock.mockResolvedValue({
      avg: 3.5,
      count: 4,
      distribution: { 1: 0, 2: 1, 3: 1, 4: 1, 5: 1 },
    });
    const res = await GET(new Request(`http://localhost/api/doctor/material-ratings/aggregate?kind=lfk_exercise&id=${UUID}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.count).toBe(4);
    expect(getPublicAggregateMock).toHaveBeenCalledWith({ targetKind: "lfk_exercise", targetId: UUID });
  });

  it("returns 404 when aggregate not available", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    getPublicAggregateMock.mockRejectedValue(new MaterialRatingAccessError("not_found"));
    const res = await GET(new Request(`http://localhost/api/doctor/material-ratings/aggregate?kind=content_page&id=${UUID}`));
    expect(res.status).toBe(404);
  });
});
