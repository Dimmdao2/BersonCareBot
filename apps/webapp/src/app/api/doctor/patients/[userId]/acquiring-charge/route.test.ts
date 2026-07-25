import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

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
  requireEntitlementForMutation: (...args: unknown[]) => requireEntitlementMock(...args),
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

import { POST } from "./route";

const ORG_ID = "10000000-0000-4000-8000-000000000001";
const DOCTOR_ID = "00000000-0000-4000-8000-00000000000d";
const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const CANONICAL_PATIENT_ID = "00000000-0000-4000-8000-000000000002";

describe("doctor patient acquiring charge route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireEntitlementMock.mockResolvedValue({ ok: true });
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

  it("returns workspace gate response before resolving deps", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "doctor_workspace_membership_required" }, { status: 403 }),
    });

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountMinor: 1000 }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );

    expect(res.status).toBe(403);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it("does not create provider charge outside selected workspace", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue(null);
    const createCharge = vi.fn();
    const recordAcquiringCharge = vi.fn();
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      acquiringGateway: { createCharge },
      patientPayments: { recordAcquiringCharge },
    });

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountMinor: 1000 }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );

    expect(res.status).toBe(404);
    expect(getClientIdentityForOrganization).toHaveBeenCalledWith(PATIENT_ID, ORG_ID);
    expect(createCharge).not.toHaveBeenCalled();
    expect(recordAcquiringCharge).not.toHaveBeenCalled();
  });

  it("creates charge and records pending payment for canonical patient", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const createCharge = vi.fn().mockResolvedValue({
      ok: true,
      providerPaymentId: "provider-payment-1",
      redirectUrl: "https://pay.example/1",
    });
    const recordAcquiringCharge = vi.fn().mockResolvedValue({ id: "payment-1" });
    const getSettings = vi.fn().mockResolvedValue({ defaultProviderId: "mock-provider" });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      acquiringGateway: { createCharge },
      payments: { getSettings },
      patientPayments: { recordAcquiringCharge },
    });

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountMinor: 1000, description: "visit" }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );

    expect(res.status).toBe(201);
    expect(requireEntitlementMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      "payments",
    );
    expect(createCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        patientUserId: CANONICAL_PATIENT_ID,
        amountMinor: 1000,
        description: "visit",
      }),
    );
    expect(recordAcquiringCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        patientUserId: CANONICAL_PATIENT_ID,
        amountMinor: 1000,
        provider: "mock-provider",
        providerPaymentId: "provider-payment-1",
        createdBy: DOCTOR_ID,
      }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(Function),
    );
  });

  it("denies acquiring charge when the payments mechanic is disabled, after identity resolution, without calling the gateway", async () => {
    const order: string[] = [];
    const getClientIdentityForOrganization = vi.fn().mockImplementation(async () => {
      order.push("identity");
      return { userId: CANONICAL_PATIENT_ID };
    });
    const createCharge = vi.fn();
    const recordAcquiringCharge = vi.fn();
    requireEntitlementMock.mockImplementation(async () => {
      order.push("entitlement");
      return { ok: false, response: new Response(null, { status: 403 }) };
    });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      acquiringGateway: { createCharge },
      patientPayments: { recordAcquiringCharge },
    });

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountMinor: 1000 }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );

    expect(res.status).toBe(403);
    expect(order).toEqual(["identity", "entitlement"]);
    expect(requireEntitlementMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      "payments",
    );
    expect(createCharge).not.toHaveBeenCalled();
    expect(recordAcquiringCharge).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });
});
