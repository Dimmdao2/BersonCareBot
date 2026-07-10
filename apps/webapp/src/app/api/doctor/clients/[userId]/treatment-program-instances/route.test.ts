import { beforeEach, describe, expect, it, vi } from "vitest";

const assignMock = vi.fn();
const createBlankMock = vi.fn();
const getClientIdentityMock = vi.fn();
const getClientIdentityForOrganizationMock = vi.fn();
const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
}));

vi.mock("@/app-layer/cache/revalidatePatientTreatmentProgramUi", () => ({
  revalidatePatientTreatmentProgramUi: vi.fn(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: {
      assignTemplateToPatient: assignMock,
      createBlankIndividualPlan: createBlankMock,
    },
    doctorClientsPort: {
      getClientIdentity: getClientIdentityMock,
      getClientIdentityForOrganization: getClientIdentityForOrganizationMock,
    },
  }),
}));

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

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: vi.fn().mockResolvedValue({
    user: { userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", role: "doctor", bindings: {} },
  }),
}));

import { POST } from "./route";

const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const TEMPLATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workspaceCtx = {
  session: { user: { userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", role: "doctor", bindings: {} } },
  organizationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  membershipId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  membershipRole: "doctor",
  specialistId: null,
  canManageOrganization: false,
  canManageAllSpecialists: false,
};

describe("POST /api/doctor/clients/[userId]/treatment-program-instances", () => {
  beforeEach(() => {
    assignMock.mockReset();
    createBlankMock.mockReset();
    getClientIdentityMock.mockReset();
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
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspaceCtx });
    const identity = {
      userId: PATIENT_ID,
      displayName: "P",
      phone: "+70000000000",
      bindings: {},
      createdAt: null,
      isBlocked: false,
      blockedReason: null,
      isArchived: false,
    };
    getClientIdentityMock.mockResolvedValue(identity);
    getClientIdentityForOrganizationMock.mockResolvedValue(identity);
  });

  it("kind from_template вызывает assignTemplateToPatient", async () => {
    assignMock.mockResolvedValue({ id: "inst-1" });
    const res = await POST(
      new Request(`http://localhost/api/doctor/clients/${PATIENT_ID}/treatment-program-instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "from_template", templateId: TEMPLATE_ID }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );
    expect(res.status).toBe(200);
    expect(assignMock).toHaveBeenCalledWith({
      templateId: TEMPLATE_ID,
      patientUserId: PATIENT_ID,
      assignedBy: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      assignmentSource: "doctor",
    });
    expect(createBlankMock).not.toHaveBeenCalled();
  });

  it("legacy body { templateId } вызывает assignTemplateToPatient", async () => {
    assignMock.mockResolvedValue({ id: "inst-2" });
    const res = await POST(
      new Request(`http://localhost/api/doctor/clients/${PATIENT_ID}/treatment-program-instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: TEMPLATE_ID }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );
    expect(res.status).toBe(200);
    expect(assignMock).toHaveBeenCalled();
    expect(createBlankMock).not.toHaveBeenCalled();
  });

  it("kind blank вызывает createBlankIndividualPlan", async () => {
    createBlankMock.mockResolvedValue({ id: "inst-blank" });
    const res = await POST(
      new Request(`http://localhost/api/doctor/clients/${PATIENT_ID}/treatment-program-instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "blank" }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );
    expect(res.status).toBe(200);
    expect(createBlankMock).toHaveBeenCalledWith({
      patientUserId: PATIENT_ID,
      assignedBy: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      title: undefined,
    });
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("kind blank с title пробрасывает title в createBlankIndividualPlan", async () => {
    createBlankMock.mockResolvedValue({ id: "inst-titled" });
    const res = await POST(
      new Request(`http://localhost/api/doctor/clients/${PATIENT_ID}/treatment-program-instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "blank", title: "Индивидуально" }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );
    expect(res.status).toBe(200);
    expect(createBlankMock).toHaveBeenCalledWith({
      patientUserId: PATIENT_ID,
      assignedBy: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      title: "Индивидуально",
    });
  });
});
