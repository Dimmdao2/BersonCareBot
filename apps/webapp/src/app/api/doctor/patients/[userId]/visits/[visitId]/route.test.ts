import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireDoctorWorkspaceApiContextMock,
  updateVisitFieldsMock,
  buildAppDepsMock,
  withDoctorWorkspacePrincipalMock,
  principalState,
} = vi.hoisted(() => {
  const updateVisitFieldsMockInner = vi.fn();
  const principalState = { inside: false };
  return {
    requireDoctorWorkspaceApiContextMock: vi.fn(),
    updateVisitFieldsMock: updateVisitFieldsMockInner,
    buildAppDepsMock: vi.fn(() => ({
      patientClinical: {
        updateVisitFields: updateVisitFieldsMockInner,
      },
    })),
    withDoctorWorkspacePrincipalMock: vi.fn(
      async <T,>(_workspace: { organizationId: string }, _source: string, fn: () => Promise<T>) => {
        principalState.inside = true;
        try {
          return await fn();
        } finally {
          principalState.inside = false;
        }
      },
    ),
    principalState,
  };
});

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { PATCH } from "./route";

const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const VISIT_ID = "00000000-0000-4000-8000-0000000000aa";

function workspaceGate() {
  return {
    ok: true as const,
    ctx: {
      organizationId: "00000000-0000-4000-8000-0000000000f1",
      session: {
        user: { userId: "00000000-0000-4000-8000-00000000000d", role: "doctor", bindings: {} },
      },
    },
  };
}

describe("PATCH /api/doctor/patients/[userId]/visits/[visitId]", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    updateVisitFieldsMock.mockReset();
    buildAppDepsMock.mockClear();
    principalState.inside = false;
    requireDoctorWorkspaceApiContextMock.mockResolvedValue(workspaceGate());
    updateVisitFieldsMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return true;
    });
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
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "00000000-0000-4000-8000-0000000000f1" }),
      "doctor.patients.clinical.visit.update",
      expect.any(Function),
    );
  });
});
