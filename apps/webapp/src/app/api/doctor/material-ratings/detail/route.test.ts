import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const getTzMock = vi.hoisted(() => vi.fn());
const getDoctorDetailForDoctorMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: getTzMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    materialRating: { getDoctorDetailForDoctor: getDoctorDetailForDoctorMock },
  }),
}));

import { GET } from "./route";

describe("GET /api/doctor/material-ratings/detail", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getTzMock.mockReset();
    getDoctorDetailForDoctorMock.mockReset();
    getTzMock.mockResolvedValue("UTC");
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(
      new Request(
        "http://localhost/api/doctor/material-ratings/detail?kind=lfk_exercise&id=550e8400-e29b-41d4-a716-446655440099",
      ),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for client role", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "u1", role: "client", bindings: {} } });
    const res = await GET(
      new Request(
        "http://localhost/api/doctor/material-ratings/detail?kind=lfk_exercise&id=550e8400-e29b-41d4-a716-446655440099",
      ),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid uuid", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await GET(
      new Request("http://localhost/api/doctor/material-ratings/detail?kind=lfk_exercise&id=not-uuid"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 unexpected_from_to when preset is week but from/to passed", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await GET(
      new Request(
        "http://localhost/api/doctor/material-ratings/detail?kind=lfk_exercise&id=550e8400-e29b-41d4-a716-446655440099&preset=week&from=2026-05-01",
      ),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("unexpected_from_to");
  });

  it("returns 400 range_too_long for custom span > 31 days", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await GET(
      new Request(
        "http://localhost/api/doctor/material-ratings/detail?kind=lfk_exercise&id=550e8400-e29b-41d4-a716-446655440099&preset=custom&from=2026-01-01&to=2026-03-01",
      ),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("range_too_long");
  });

  it("returns detail payload for doctor", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    getDoctorDetailForDoctorMock.mockResolvedValue({
      days: [
        {
          day: "2026-05-15",
          viewCount: 1,
          ratingActivityCount: 2,
          avgStarsInActivity: 4.5,
        },
      ],
      raters: [
        {
          userId: "u2",
          stars: 5,
          updatedAt: "2026-05-15T12:00:00.000Z",
          displayLabel: "Пациент",
        },
      ],
    });
    const res = await GET(
      new Request(
        "http://localhost/api/doctor/material-ratings/detail?kind=lfk_exercise&id=550e8400-e29b-41d4-a716-446655440099&preset=month",
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.iana).toBe("UTC");
    expect(json.days).toHaveLength(1);
    expect(json.raters).toHaveLength(1);
    expect(getDoctorDetailForDoctorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetKind: "lfk_exercise",
        targetId: "550e8400-e29b-41d4-a716-446655440099",
        iana: "UTC",
      }),
    );
  });

  it("returns 404 when target missing", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const { MaterialRatingAccessError } = await import("@/modules/material-rating/types");
    getDoctorDetailForDoctorMock.mockRejectedValue(new MaterialRatingAccessError("not_found"));
    const res = await GET(
      new Request(
        "http://localhost/api/doctor/material-ratings/detail?kind=lfk_exercise&id=550e8400-e29b-41d4-a716-446655440099",
      ),
    );
    expect(res.status).toBe(404);
  });
});
