import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireDoctorWorkspaceApiContextMock,
  createVisitMock,
  buildAppDepsMock,
  withDoctorWorkspacePrincipalMock,
  principalState,
} = vi.hoisted(() => {
  const createVisitMockInner = vi.fn();
  const principalState = { inside: false };
  return {
    requireDoctorWorkspaceApiContextMock: vi.fn(),
    createVisitMock: createVisitMockInner,
    buildAppDepsMock: vi.fn(() => ({
      patientClinical: {
        createVisit: createVisitMockInner,
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

import { POST } from "./route";

const DOCTOR_ID = "00000000-0000-4000-8000-00000000000d";
const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const VISIT_ID = "00000000-0000-4000-8000-0000000000aa";

function workspaceGate() {
  return {
    ok: true as const,
    ctx: {
      organizationId: "00000000-0000-4000-8000-0000000000f1",
      session: { user: { userId: DOCTOR_ID, role: "doctor", bindings: {} } },
    },
  };
}

describe("POST /api/doctor/patients/[userId]/visits", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    createVisitMock.mockReset();
    buildAppDepsMock.mockClear();
    principalState.inside = false;
    requireDoctorWorkspaceApiContextMock.mockResolvedValue(workspaceGate());
    createVisitMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return VISIT_ID;
    });
  });

  it("forwards manipulation and recommendation text into visit creation", async () => {
    const res = await POST(
      new Request(`http://localhost/api/doctor/patients/${PATIENT_ID}/visits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          visitType: "first",
          date: "2026-07-06T18:00:00.000Z",
          manipulations: "Свободный текст\nМобилизация",
          recommendations: "Ходьба\n1 раз · ежедневно",
        }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );

    expect(res.status).toBe(201);
    expect(createVisitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        patientUserId: PATIENT_ID,
        visitedAt: "2026-07-06T18:00:00.000Z",
        manipulations: "Свободный текст\nМобилизация",
        recommendations: "Ходьба\n1 раз · ежедневно",
        createdBy: DOCTOR_ID,
      }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "00000000-0000-4000-8000-0000000000f1" }),
      "doctor.patients.clinical.visit.create",
      expect.any(Function),
    );
  });
});
