import { beforeEach, describe, expect, it, vi } from "vitest";

const buildAppDepsMock = vi.hoisted(() => vi.fn());
const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const requireEntitlementMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlement: (...args: unknown[]) => requireEntitlementMock(...args),
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

import { PATCH } from "./route";

const ORG_ID = "10000000-0000-4000-8000-000000000001";
const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const CANONICAL_PATIENT_ID = "00000000-0000-4000-8000-000000000002";
const VISIT_ID = "00000000-0000-4000-8000-0000000000aa";

describe("PATCH /api/doctor/patients/[userId]/visits/[visitId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireEntitlementMock.mockResolvedValue({ ok: true });
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORG_ID,
        session: { user: { userId: "00000000-0000-4000-8000-00000000000d", role: "doctor" } },
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

  it("updates visit fields for canonical patient under selected workspace principal", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const updateVisitFields = vi.fn().mockResolvedValue(true);
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientClinical: { updateVisitFields },
    });

    const res = await PATCH(
      new Request(`http://localhost/api/doctor/patients/${PATIENT_ID}/visits/${VISIT_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          manipulations: "Свободный текст\nМобилизация",
          recommendations: "Ходьба\n1 раз · ежедневно",
        }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID, visitId: VISIT_ID }) },
    );

    expect(res.status).toBe(200);
    expect(getClientIdentityForOrganization).toHaveBeenCalledWith(PATIENT_ID, ORG_ID);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(Function),
    );
    expect(updateVisitFields).toHaveBeenCalledWith({
      patientUserId: CANONICAL_PATIENT_ID,
      visitId: VISIT_ID,
      manipulations: "Свободный текст\nМобилизация",
      recommendations: "Ходьба\n1 раз · ежедневно",
    });
  });

  it("resolves the trusted patient before denying a disabled card without calling the visit service", async () => {
    const order: string[] = [];
    const getClientIdentityForOrganization = vi.fn().mockImplementation(async () => {
      order.push("identity");
      return { userId: CANONICAL_PATIENT_ID };
    });
    const updateVisitFields = vi.fn();
    requireEntitlementMock.mockImplementation(async () => {
      order.push("entitlement");
      return { ok: false, response: new Response(null, { status: 403 }) };
    });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientClinical: { updateVisitFields },
    });

    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exam: "Осмотр" }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID, visitId: VISIT_ID }) },
    );

    expect(res.status).toBe(403);
    expect(order).toEqual(["identity", "entitlement"]);
    expect(requireEntitlementMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      "patient_card",
      { kind: "mutation" },
    );
    expect(updateVisitFields).not.toHaveBeenCalled();
  });
});
