import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listClinicalMock,
  getClientIdentityForOrganizationMock,
  buildAppDepsMock,
  requireDoctorWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
} = vi.hoisted(() => {
  const listClinicalMockInner = vi.fn();
  return {
    listClinicalMock: listClinicalMockInner,
    getClientIdentityForOrganizationMock: vi.fn(),
    buildAppDepsMock: vi.fn(() => ({
      treatmentProgramInstance: {
        listForPatientClinicalView: listClinicalMockInner,
      },
      doctorClientsPort: {
        getClientIdentityForOrganization: getClientIdentityForOrganizationMock,
      },
    })),
    requireDoctorWorkspaceApiContextMock: vi.fn(),
    withDoctorWorkspacePrincipalMock: vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
}),
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({ buildAppDeps: buildAppDepsMock }));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));
vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (
    ctx: unknown,
    sourceOrFn: string | (() => unknown),
    maybeFn?: () => unknown,
  ) => {
    const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
    if (!fn) throw new Error("principal_callback_required");
    return withDoctorWorkspacePrincipalMock(ctx, fn);
  },
}));

import { GET } from "./route";

const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const CANONICAL_PATIENT_ID = "00000000-0000-4000-8000-000000000011";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const DOCTOR_INSTANCE = {
  id: "11111111-1111-4111-8111-111111111111",
  patientUserId: CANONICAL_PATIENT_ID,
  templateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  assignedBy: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  assignmentSource: "doctor" as const,
  title: "Клиника",
  status: "active" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  patientPlanLastOpenedAt: null,
};

describe("GET /api/doctor/clients/[userId]/treatment-program-instances", () => {
  beforeEach(() => {
    listClinicalMock.mockReset();
    getClientIdentityForOrganizationMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        session: { user: { userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", role: "doctor", bindings: {} } },
        organizationId: ORG_ID,
        membershipId: "33333333-3333-4333-8333-333333333333",
        membershipRole: "doctor",
        specialistId: null,
        canManageOrganization: false,
        canManageAllSpecialists: false,
      },
    });
    getClientIdentityForOrganizationMock.mockResolvedValue({
      userId: CANONICAL_PATIENT_ID,
      displayName: "P",
      phone: "+70000000000",
      bindings: {},
      createdAt: null,
      isBlocked: false,
      blockedReason: null,
      isArchived: false,
    });
  });

  it("returns clinical instances without promo", async () => {
    listClinicalMock.mockResolvedValue([DOCTOR_INSTANCE]);
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, items: [DOCTOR_INSTANCE] });
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(PATIENT_ID, ORG_ID);
    expect(listClinicalMock).toHaveBeenCalledWith(CANONICAL_PATIENT_ID);
  });
});
