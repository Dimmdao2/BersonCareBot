import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const buildAppDepsMock = vi.hoisted(() => vi.fn());
const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
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

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

describe("doctor patient profile route", () => {
  const organizationId = "b0000000-0000-4000-8000-000000000001";
  const patientId = "a0000000-0000-4000-8000-000000000001";
  const canonicalPatientId = "a0000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: { user: { userId: "doc-1", role: "doctor" } },
      },
    });
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
  });

  it("returns workspace gate response before resolving deps", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "doctor_workspace_membership_required" },
        { status: 403 },
      ),
    });

    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate: null }),
      }),
      { params: Promise.resolve({ userId: patientId }) },
    );

    expect(res.status).toBe(403);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it("rejects patient updates outside selected workspace", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue(null);
    const setPatientBirthDate = vi.fn();
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      doctorClients: { setPatientBirthDate },
    });

    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate: "2026-01-02" }),
      }),
      { params: Promise.resolve({ userId: patientId }) },
    );

    expect(res.status).toBe(404);
    expect(getClientIdentityForOrganization).toHaveBeenCalledWith(patientId, organizationId);
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
    expect(setPatientBirthDate).not.toHaveBeenCalled();
  });

  it("updates global patient profile fields under selected workspace principal", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({ userId: canonicalPatientId });
    const setPatientBirthDate = vi.fn().mockResolvedValue(undefined);
    const setPatientGender = vi.fn().mockResolvedValue(undefined);
    const setPatientNames = vi.fn().mockResolvedValue(undefined);
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      doctorClients: {
        setPatientBirthDate,
        setPatientGender,
        setPatientNames,
      },
    });

    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthDate: "2026-01-02",
          gender: "female",
          displayName: "Patient One",
        }),
      }),
      { params: Promise.resolve({ userId: patientId }) },
    );

    expect(res.status).toBe(200);
    expect(getClientIdentityForOrganization).toHaveBeenCalledWith(patientId, organizationId);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
    expect(setPatientBirthDate).toHaveBeenCalledWith(canonicalPatientId, "2026-01-02");
    expect(setPatientGender).toHaveBeenCalledWith(canonicalPatientId, "female");
    expect(setPatientNames).toHaveBeenCalledWith(canonicalPatientId, { displayName: "Patient One" });
  });

  it("reads patient header only after selected workspace membership is confirmed", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({ userId: canonicalPatientId });
    const getPatientCardHeader = vi.fn().mockResolvedValue({ userId: canonicalPatientId, displayName: "Patient One" });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      doctorClients: { getPatientCardHeader },
    });

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: patientId }),
    });
    const json = (await res.json()) as { ok?: boolean; header?: { userId?: string } };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.header?.userId).toBe(canonicalPatientId);
    expect(getClientIdentityForOrganization).toHaveBeenCalledWith(patientId, organizationId);
    expect(getPatientCardHeader).toHaveBeenCalledWith(canonicalPatientId);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
  });
});
