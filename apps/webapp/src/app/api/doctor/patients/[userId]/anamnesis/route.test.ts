import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlementForMutation: async () => ({ ok: true }),
}));

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

import { GET, POST } from "./route";

const ORG_ID = "10000000-0000-4000-8000-000000000001";
const DOCTOR_ID = "00000000-0000-4000-8000-00000000000d";
const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const CANONICAL_PATIENT_ID = "00000000-0000-4000-8000-000000000002";

describe("doctor patient anamnesis route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORG_ID,
        session: { user: { userId: DOCTOR_ID, role: "doctor" } },
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

  it("reads anamnesis for canonical patient under selected workspace principal", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const getAnamnesis = vi.fn().mockResolvedValue({ trauma: [], illness: [], lifestyle: [] });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientClinical: { getAnamnesis },
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });

    expect(res.status).toBe(200);
    expect(getClientIdentityForOrganization).toHaveBeenCalledWith(PATIENT_ID, ORG_ID);
    expect(getAnamnesis).toHaveBeenCalledWith(CANONICAL_PATIENT_ID);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(Function),
    );
  });

  it("appends anamnesis for canonical patient under selected workspace principal", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const appendAnamnesisTrauma = vi.fn().mockResolvedValue({
      id: "entry-1",
      year: "2020",
      what: "Травма",
      type: "Травма",
      immobilization: "—",
    });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientClinical: { appendAnamnesisTrauma },
    });

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          section: "trauma",
          year: "2020",
          what: "Травма",
          type: "Травма",
        }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );

    expect(res.status).toBe(201);
    expect(appendAnamnesisTrauma).toHaveBeenCalledWith(
      expect.objectContaining({
        patientUserId: CANONICAL_PATIENT_ID,
        createdBy: DOCTOR_ID,
      }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(Function),
    );
  });
});
