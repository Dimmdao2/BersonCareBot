import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const getDoctorSummaryMock = vi.hoisted(() => vi.fn());
const listDoctorFeedbackForPageMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    materialRatingFeedback: {
      getDoctorSummary: getDoctorSummaryMock,
      listDoctorFeedbackForPage: listDoctorFeedbackForPageMock,
    },
  }),
}));

import { GET } from "./route";

const UUID = "550e8400-e29b-41d4-a716-446655440099";

describe("GET /api/doctor/material-ratings/feedback", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getDoctorSummaryMock.mockReset();
    listDoctorFeedbackForPageMock.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request(`http://localhost/api/doctor/material-ratings/feedback?contentPageId=${UUID}`));
    expect(res.status).toBe(401);
  });

  it("returns paginated feedback rows for doctor", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    getDoctorSummaryMock.mockResolvedValue({ total: 2, byReasonCode: {}, recent: [] });
    listDoctorFeedbackForPageMock.mockResolvedValue([
      {
        id: "fb-1",
        userId: "u1",
        displayLabel: "Patient",
        ratingValue: 2,
        reasonCodes: ["too_hard"],
        comment: "ok",
        createdAt: "2026-05-26T10:00:00.000Z",
      },
    ]);
    const res = await GET(
      new Request(`http://localhost/api/doctor/material-ratings/feedback?contentPageId=${UUID}&limit=1&offset=0`),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.total).toBe(2);
    expect(json.rows).toHaveLength(1);
    expect(listDoctorFeedbackForPageMock).toHaveBeenCalledWith(UUID, 1, 0);
  });
});
