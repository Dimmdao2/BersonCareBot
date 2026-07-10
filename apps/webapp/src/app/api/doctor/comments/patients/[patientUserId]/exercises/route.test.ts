import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
}));
const getClientIdentityForOrganizationMock = vi.hoisted(() => vi.fn());
const loadDoctorPatientExercisesWithCommentsMock = vi.hoisted(() => vi.fn());

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
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    doctorClientsPort: {
      getClientIdentityForOrganization: getClientIdentityForOrganizationMock,
    },
    treatmentProgramInstance: {},
    programItemDiscussion: {},
  }),
}));
vi.mock("@/app/app/doctor/comments/loadDoctorPatientExercisesWithComments", () => ({
  loadDoctorPatientExercisesWithComments: loadDoctorPatientExercisesWithCommentsMock,
}));

import { GET } from "./route";

const inputPatientUserId = "10000000-0000-4000-8000-000000000001";
const canonicalPatientUserId = "10000000-0000-4000-8000-000000000011";
const doctorUserId = "20000000-0000-4000-8000-000000000002";
const organizationId = "30000000-0000-4000-8000-000000000003";

const workspaceCtx = {
  session: { user: { userId: doctorUserId, role: "doctor", bindings: {} } },
  organizationId,
  membershipId: "40000000-0000-4000-8000-000000000004",
  membershipRole: "doctor",
  specialistId: null,
  canManageOrganization: false,
  canManageAllSpecialists: false,
};

function params(patientUserId = inputPatientUserId) {
  return { params: Promise.resolve({ patientUserId }) };
}

describe("GET /api/doctor/comments/patients/[patientUserId]/exercises", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
    getClientIdentityForOrganizationMock.mockReset();
    loadDoctorPatientExercisesWithCommentsMock.mockReset();

    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspaceCtx });
    getClientIdentityForOrganizationMock.mockResolvedValue({ userId: canonicalPatientUserId });
    loadDoctorPatientExercisesWithCommentsMock.mockResolvedValue({ groups: [] });
  });

  it("loads exercises for the canonical patient inside the selected workspace", async () => {
    const res = await GET(
      new Request("http://localhost/api/doctor/comments/patients/p/exercises?includePastPrograms=true"),
      params(),
    );

    expect(res.status).toBe(200);
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(inputPatientUserId, organizationId);
    expect(loadDoctorPatientExercisesWithCommentsMock).toHaveBeenCalledWith(
      expect.any(Object),
      {
        patientUserId: canonicalPatientUserId,
        viewerUserId: doctorUserId,
        organizationId,
      },
      { includePastPrograms: true },
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
  });

  it("returns 404 when patient is outside selected workspace", async () => {
    getClientIdentityForOrganizationMock.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/doctor/comments/patients/p/exercises"), params());

    expect(res.status).toBe(404);
    expect(loadDoctorPatientExercisesWithCommentsMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed patient id", async () => {
    const res = await GET(
      new Request("http://localhost/api/doctor/comments/patients/p/exercises"),
      params("not-a-uuid"),
    );

    expect(res.status).toBe(400);
    expect(getClientIdentityForOrganizationMock).not.toHaveBeenCalled();
  });
});
