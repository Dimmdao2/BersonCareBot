/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { DoctorWorkspaceAccessContext } from "@/app-layer/guards/requireRole";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const getInstanceByIdMock = vi.hoisted(() => vi.fn());
const getClientIdentityMock = vi.hoisted(() => vi.fn());
const doctorAcceptTestAttemptMock = vi.hoisted(() => vi.fn());
const principalState = vi.hoisted(() => ({ inside: false }));
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async <T,>(
    _workspace: Pick<DoctorWorkspaceAccessContext, "organizationId">,
    _source: string,
    fn: () => Promise<T>,
  ) => {
    principalState.inside = true;
    try {
      return await fn();
    } finally {
      principalState.inside = false;
    }
  }),
);

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: {
      getInstanceById: getInstanceByIdMock,
    },
    doctorClientsPort: {
      getClientIdentity: getClientIdentityMock,
    },
    treatmentProgramProgress: {
      doctorAcceptTestAttempt: doctorAcceptTestAttemptMock,
    },
  }),
}));

import { POST } from "./route";

const instanceId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const doctorUserId = "33333333-3333-4333-8333-333333333333";
const patientUserId = "44444444-4444-4444-8444-444444444444";

function routeContext(params: { instanceId: string; attemptId: string }) {
  return { params: Promise.resolve(params) };
}

function workspaceContext(): DoctorWorkspaceAccessContext {
  return {
    session: {
      user: {
        userId: doctorUserId,
        role: "doctor",
        displayName: "Doctor",
        bindings: {},
      },
      issuedAt: 1,
      expiresAt: 9e9,
    },
    organizationId: "55555555-5555-4555-8555-555555555555",
    membershipId: "membership-1",
    membershipRole: "doctor",
    specialistId: "specialist-1",
    canManageOrganization: false,
    canManageAllSpecialists: false,
  };
}

describe("POST doctor treatment-program test-attempt accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: workspaceContext(),
    });
    getInstanceByIdMock.mockResolvedValue({
      id: instanceId,
      patientUserId,
      organizationId: workspaceContext().organizationId,
    });
    getClientIdentityMock.mockResolvedValue({ userId: patientUserId });
    doctorAcceptTestAttemptMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
    });
  });

  it("returns gate failure response when doctor workspace gate fails", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });

    const response = await POST(new Request("http://localhost/accept", { method: "POST" }), {
      params: Promise.resolve({ instanceId, attemptId }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(getInstanceByIdMock).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
    expect(doctorAcceptTestAttemptMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid ids before mutation", async () => {
    const response = await POST(new Request("http://localhost/accept", { method: "POST" }), {
      params: Promise.resolve({ instanceId: "bad-id", attemptId }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid_id" });
    expect(getInstanceByIdMock).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
    expect(doctorAcceptTestAttemptMock).not.toHaveBeenCalled();
  });

  it("accepts the attempt inside the doctor workspace principal", async () => {
    const workspace = workspaceContext();
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: true,
      ctx: workspace,
    });

    const response = await POST(new Request("http://localhost/accept", { method: "POST" }), {
      params: Promise.resolve({ instanceId, attemptId }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(getInstanceByIdMock).toHaveBeenCalledWith(instanceId);
    expect(getClientIdentityMock).toHaveBeenCalledWith(patientUserId);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspace,
      "doctor.treatment-program.test-attempt.accept",
      expect.any(Function),
    );
    expect(doctorAcceptTestAttemptMock).toHaveBeenCalledWith({
      instanceId,
      attemptId,
      doctorUserId,
    });
    expect(principalState.inside).toBe(false);
  });

  it("does not enter the principal wrapper when pre-mutation access check fails", async () => {
    getClientIdentityMock.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/accept", { method: "POST" }),
      routeContext({ instanceId, attemptId }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "not_found" });
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
    expect(doctorAcceptTestAttemptMock).not.toHaveBeenCalled();
  });
});
