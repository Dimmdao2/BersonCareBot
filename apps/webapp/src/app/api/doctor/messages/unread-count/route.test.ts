import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireDoctorWorkspaceApiContextMock, getClientIdentityForOrganizationMock, unreadFromPatientMock } = vi.hoisted(() => {
  const getClientIdentityForOrganizationMock = vi.fn();
  return {
    requireDoctorWorkspaceApiContextMock: vi.fn(),
    getClientIdentityForOrganizationMock,
    unreadFromPatientMock: vi.fn(),
  };
});

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    doctorClientsPort: { getClientIdentityForOrganization: getClientIdentityForOrganizationMock },
    messaging: { doctorSupport: { unreadFromPatient: unreadFromPatientMock, unreadFromUsers: vi.fn() } },
  }),
}));

import { GET } from "./route";

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const PATIENT_A = "a0000000-0000-4000-8000-000000000011";
const PATIENT_B = "b0000000-0000-4000-8000-000000000022";

describe("GET /api/doctor/messages/unread-count organization boundary", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    getClientIdentityForOrganizationMock.mockReset();
    unreadFromPatientMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORG_A, session: { user: { userId: "doctor-a", role: "doctor" } } },
    });
  });

  it("does not count the second organization's patient", async () => {
    getClientIdentityForOrganizationMock.mockResolvedValue(null);
    const response = await GET(new Request(`http://localhost/api/doctor/messages/unread-count?patientUserId=${PATIENT_B}`));

    expect(response.status).toBe(404);
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(PATIENT_B, ORG_A);
    expect(unreadFromPatientMock).not.toHaveBeenCalled();
  });

  it("counts only the resolved organization's patient", async () => {
    getClientIdentityForOrganizationMock.mockResolvedValue({ userId: PATIENT_A });
    unreadFromPatientMock.mockResolvedValue(3);
    const response = await GET(new Request(`http://localhost/api/doctor/messages/unread-count?patientUserId=${PATIENT_A}`));

    expect(response.status).toBe(200);
    expect(unreadFromPatientMock).toHaveBeenCalledWith(PATIENT_A, ORG_A);
  });
});
