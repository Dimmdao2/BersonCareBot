import { describe, expect, it, vi, beforeEach } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const offerCatalogPackageToPatientMock = vi.hoisted(() => vi.fn());
const createManualPatientPackageMock = vi.hoisted(() => vi.fn());
const requireEntitlementMock = vi.hoisted(() => vi.fn());
const principalState = vi.hoisted(() => ({ inside: false }));
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async <T,>(
    _workspace: { organizationId: string },
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

vi.mock("../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlementForMutation: requireEntitlementMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    memberships: {
      offerCatalogPackageToPatient: offerCatalogPackageToPatientMock,
      createManualPatientPackage: createManualPatientPackageMock,
    },
  }),
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

import { POST } from "./route";
import { NextResponse } from "next/server";

type MembershipWriteOptions = {
  runMembershipWrite?: <T>(fn: () => Promise<T>) => Promise<T>;
};

describe("/api/doctor/booking-engine/patient-packages POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "550e8400-e29b-41d4-a716-446655440099" } },
      },
    });
    requireEntitlementMock.mockReset();
    requireEntitlementMock.mockResolvedValue({ ok: true });
    offerCatalogPackageToPatientMock.mockImplementation(
      async (_input: unknown, options?: MembershipWriteOptions) =>
        options?.runMembershipWrite
          ? options.runMembershipWrite(async () => {
              expect(principalState.inside).toBe(true);
              return { id: "pp-1", status: "offered" };
            })
          : { id: "pp-1", status: "offered" },
    );
    createManualPatientPackageMock.mockImplementation(
      async (_input: unknown, options?: MembershipWriteOptions) =>
        options?.runMembershipWrite
          ? options.runMembershipWrite(async () => {
              expect(principalState.inside).toBe(true);
              return { id: "pp-2", status: "active" };
            })
          : { id: "pp-2", status: "active" },
    );
  });

  it("passes notes on catalog offer", async () => {
    await POST(
      new Request("http://localhost/api/doctor/booking-engine/patient-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "catalog",
          platformUserId: "550e8400-e29b-41d4-a716-446655440001",
          subscriptionPackageId: "550e8400-e29b-41d4-a716-446655440002",
          notes: "комментарий",
        }),
      }),
    );
    expect(offerCatalogPackageToPatientMock).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "комментарий" }),
      expect.objectContaining({ runMembershipWrite: expect.any(Function) }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      "doctor.booking-engine.patient-packages.catalog-offer",
      expect.any(Function),
    );
  });

  it("creates manual package without title", async () => {
    await POST(
      new Request("http://localhost/api/doctor/booking-engine/patient-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "manual",
          platformUserId: "550e8400-e29b-41d4-a716-446655440001",
          priceMinor: 10000,
          items: [{ serviceId: "550e8400-e29b-41d4-a716-446655440003", quantity: 1 }],
          notes: "n",
        }),
      }),
    );
    expect(createManualPatientPackageMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: undefined, notes: "n" }),
      expect.objectContaining({ runMembershipWrite: expect.any(Function) }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      "doctor.booking-engine.patient-packages.manual-create",
      expect.any(Function),
    );
  });

  it("returns JSON error on catalog_not_found", async () => {
    offerCatalogPackageToPatientMock.mockRejectedValueOnce(new Error("catalog_not_found"));
    const res = await POST(
      new Request("http://localhost/api/doctor/booking-engine/patient-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "catalog",
          platformUserId: "550e8400-e29b-41d4-a716-446655440001",
          subscriptionPackageId: "550e8400-e29b-41d4-a716-446655440002",
        }),
      }),
    );
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("catalog_not_found");
  });

  it("does not resolve entitlement when the composed auth gate denies", async () => {
    requireDoctorBookingEngineMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });

    const res = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({}) }));

    expect(res.status).toBe(403);
    expect(requireEntitlementMock).not.toHaveBeenCalled();
    expect(createManualPatientPackageMock).not.toHaveBeenCalled();
    expect(offerCatalogPackageToPatientMock).not.toHaveBeenCalled();
  });

  it("returns entitlement denial after auth without creating a patient package", async () => {
    requireEntitlementMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "entitlement_required", mechanic: "subscriptions" }, { status: 403 }),
    });

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "manual",
          platformUserId: "550e8400-e29b-41d4-a716-446655440001",
          priceMinor: 1,
          items: [{ serviceId: "550e8400-e29b-41d4-a716-446655440003", quantity: 1 }],
        }),
      }),
    );

    expect(res.status).toBe(403);
    expect(createManualPatientPackageMock).not.toHaveBeenCalled();
    expect(offerCatalogPackageToPatientMock).not.toHaveBeenCalled();
    expect(requireDoctorBookingEngineMock.mock.invocationCallOrder[0]).toBeLessThan(
      requireEntitlementMock.mock.invocationCallOrder[0]!,
    );
  });
});
