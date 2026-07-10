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

describe("doctor patient physical route", () => {
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
        { ok: false, error: "organization_selection_required" },
        { status: 409 },
      ),
    });

    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heightCm: 170 }),
      }),
      { params: Promise.resolve({ userId: patientId }) },
    );

    expect(res.status).toBe(409);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it("rejects physical updates outside selected workspace", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue(null);
    const setPatientPhysical = vi.fn();
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      doctorClients: { setPatientPhysical },
    });

    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heightCm: 170 }),
      }),
      { params: Promise.resolve({ userId: patientId }) },
    );

    expect(res.status).toBe(404);
    expect(getClientIdentityForOrganization).toHaveBeenCalledWith(patientId, organizationId);
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
    expect(setPatientPhysical).not.toHaveBeenCalled();
  });

  it("updates physical fields under selected workspace principal", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({ userId: canonicalPatientId });
    const setPatientPhysical = vi.fn().mockResolvedValue(undefined);
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      doctorClients: { setPatientPhysical },
    });

    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heightCm: 170, weightKg: 65 }),
      }),
      { params: Promise.resolve({ userId: patientId }) },
    );

    expect(res.status).toBe(200);
    expect(getClientIdentityForOrganization).toHaveBeenCalledWith(patientId, organizationId);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
    expect(setPatientPhysical).toHaveBeenCalledWith(canonicalPatientId, { heightCm: 170, weightKg: 65 });
  });

  it("reads physical fields only after selected workspace membership is confirmed", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({ userId: canonicalPatientId });
    const getPatientPhysical = vi.fn().mockResolvedValue({ heightCm: 170, weightKg: 65 });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      doctorClients: { getPatientPhysical },
    });

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: patientId }),
    });
    const json = (await res.json()) as { ok?: boolean; heightCm?: number; weightKg?: number };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.heightCm).toBe(170);
    expect(json.weightKg).toBe(65);
    expect(getClientIdentityForOrganization).toHaveBeenCalledWith(patientId, organizationId);
    expect(getPatientPhysical).toHaveBeenCalledWith(canonicalPatientId);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
  });
});
