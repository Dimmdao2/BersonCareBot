/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, fn: () => unknown) => fn()));
const getInstanceMock = vi.fn();
const getClientIdentityMock = vi.fn();
const deleteMediaMock = vi.fn();

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (ctx: unknown, fn: () => unknown) => withDoctorWorkspacePrincipalMock(ctx, fn),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: { getInstanceById: getInstanceMock },
    doctorClientsPort: { getClientIdentity: getClientIdentityMock },
    programItemDiscussion: { deletePatientMediaMessage: deleteMediaMock },
  }),
}));

import { DELETE } from "./route";

const instanceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const messageId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const workspaceCtx = {
  session: { user: { userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", role: "doctor", bindings: {} } },
  organizationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  membershipId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  membershipRole: "doctor",
  specialistId: null,
  canManageOrganization: false,
  canManageAllSpecialists: false,
};

describe("DELETE doctor discussion media message", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation((_: unknown, fn: () => unknown) => fn());
    getInstanceMock.mockReset();
    getClientIdentityMock.mockReset();
    deleteMediaMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspaceCtx });
    getInstanceMock.mockResolvedValue({
      organizationId: workspaceCtx.organizationId,
      patientUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      assignmentSource: "doctor",
    });
    getClientIdentityMock.mockResolvedValue({ userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
    deleteMediaMock.mockResolvedValue(undefined);
  });

  it("deletes patient media message for doctor-assigned program", async () => {
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ instanceId, messageId }),
    });
    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(workspaceCtx, expect.any(Function));
    expect(deleteMediaMock).toHaveBeenCalledWith({
      messageId,
      patientUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
  });

  it("returns 404 when message missing", async () => {
    deleteMediaMock.mockRejectedValue(new Error("message_not_found"));
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ instanceId, messageId }),
    });
    expect(res.status).toBe(404);
  });
});
