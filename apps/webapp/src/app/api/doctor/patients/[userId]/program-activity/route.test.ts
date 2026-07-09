import { beforeEach, describe, expect, it, vi } from "vitest";

const buildAppDepsMock = vi.hoisted(() => vi.fn());
const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const loadDoctorPatientProgramActivityMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

vi.mock("@/app/app/doctor/patients/loadDoctorPatientProgramActivity", () => ({
  loadDoctorPatientProgramActivity: (...args: unknown[]) => loadDoctorPatientProgramActivityMock(...args),
}));

import { GET } from "./route";

const ORG_ID = "10000000-0000-4000-8000-000000000001";
const DOCTOR_ID = "00000000-0000-4000-8000-00000000000d";
const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const CANONICAL_PATIENT_ID = "00000000-0000-4000-8000-000000000002";

describe("doctor patient program activity route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORG_ID, session: { user: { userId: DOCTOR_ID, role: "doctor" } } },
    });
  });

  it("rejects reads outside selected workspace", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue(null);
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      programItemDiscussion: {},
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });

    expect(res.status).toBe(404);
    expect(loadDoctorPatientProgramActivityMock).not.toHaveBeenCalled();
  });

  it("loads activity for canonical patient and current doctor", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    loadDoctorPatientProgramActivityMock.mockResolvedValue({ lastActivity: null });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      programItemDiscussion: {},
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });

    expect(res.status).toBe(200);
    expect(loadDoctorPatientProgramActivityMock).toHaveBeenCalledWith(
      expect.any(Object),
      { patientUserId: CANONICAL_PATIENT_ID, viewerUserId: DOCTOR_ID, organizationId: ORG_ID },
    );
  });
});
