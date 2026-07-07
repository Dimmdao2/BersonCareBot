import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireDoctorApiSessionMock, updateVisitFieldsMock, buildAppDepsMock } = vi.hoisted(() => {
  const updateVisitFieldsMockInner = vi.fn();
  return {
    requireDoctorApiSessionMock: vi.fn(),
    updateVisitFieldsMock: updateVisitFieldsMockInner,
    buildAppDepsMock: vi.fn(() => ({
      patientClinical: {
        updateVisitFields: updateVisitFieldsMockInner,
      },
    })),
  };
});

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorApiSession: requireDoctorApiSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { PATCH } from "./route";

const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const VISIT_ID = "00000000-0000-4000-8000-0000000000aa";

function authedSession() {
  return {
    ok: true as const,
    session: { user: { userId: "00000000-0000-4000-8000-00000000000d", role: "doctor", bindings: {} } },
  };
}

describe("PATCH /api/doctor/patients/[userId]/visits/[visitId]", () => {
  beforeEach(() => {
    requireDoctorApiSessionMock.mockReset();
    updateVisitFieldsMock.mockReset();
    buildAppDepsMock.mockClear();
    requireDoctorApiSessionMock.mockResolvedValue(authedSession());
    updateVisitFieldsMock.mockResolvedValue(true);
  });

  it("forwards manipulation and recommendation text into visit update", async () => {
    const res = await PATCH(
      new Request(`http://localhost/api/doctor/patients/${PATIENT_ID}/visits/${VISIT_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          manipulations: "Свободный текст\nМобилизация",
          recommendations: "Ходьба\n1 раз · ежедневно",
        }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID, visitId: VISIT_ID }) },
    );

    expect(res.status).toBe(200);
    expect(updateVisitFieldsMock).toHaveBeenCalledWith({
      patientUserId: PATIENT_ID,
      visitId: VISIT_ID,
      manipulations: "Свободный текст\nМобилизация",
      recommendations: "Ходьба\n1 раз · ежедневно",
    });
  });
});
