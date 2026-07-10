import { describe, expect, it, vi, beforeEach } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const listCatalogPackagesMock = vi.hoisted(() => vi.fn());
const upsertCatalogPackageMock = vi.hoisted(() => vi.fn());
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

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    memberships: {
      listCatalogPackages: listCatalogPackagesMock,
      upsertCatalogPackage: upsertCatalogPackageMock,
    },
  }),
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

import { GET, POST } from "./route";

const SERVICE_ID = "550e8400-e29b-41d4-a716-446655440001";

const createdPkg = {
  id: "550e8400-e29b-41d4-a716-446655440030",
  organizationId: "org-1",
  title: "Новый абонемент",
  description: null,
  priceMinor: 15000,
  currency: "RUB",
  validityDays: 60,
  deductionMode: "auto_on_visit_confirmed",
  isActive: true,
  items: [{ id: "i-1", serviceId: SERVICE_ID, quantity: 10, sortOrder: 0 }],
};

describe("/api/doctor/booking-engine/packages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1", session: { user: { userId: "u1" } } },
    });
    listCatalogPackagesMock.mockResolvedValue([createdPkg]);
    upsertCatalogPackageMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return createdPkg;
    });
  });

  it("GET returns all packages including inactive", async () => {
    const res = await GET();
    const json = (await res.json()) as { ok?: boolean; packages?: typeof createdPkg[] };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.packages).toHaveLength(1);
    expect(listCatalogPackagesMock).toHaveBeenCalledWith("org-1", false);
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it("POST creates a catalog package and it appears in listCatalogPackages", async () => {
    const res = await POST(
      new Request("http://localhost/api/doctor/booking-engine/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Новый абонемент",
          priceMinor: 15000,
          validityDays: 60,
          deductionMode: "auto_on_visit_confirmed",
          isActive: true,
          items: [{ serviceId: SERVICE_ID, quantity: 10 }],
        }),
      }),
    );
    const json = (await res.json()) as { ok?: boolean; package?: typeof createdPkg };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.package?.title).toBe("Новый абонемент");
    expect(upsertCatalogPackageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        title: "Новый абонемент",
        priceMinor: 15000,
        items: [{ serviceId: SERVICE_ID, quantity: 10 }],
      }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      "doctor.booking-engine.packages.upsert",
      expect.any(Function),
    );
    // Confirm the created package appears when we list
    const listRes = await GET();
    const listJson = (await listRes.json()) as { ok?: boolean; packages?: typeof createdPkg[] };
    expect(listJson.packages?.[0]?.title).toBe("Новый абонемент");
  });

  it("POST returns 400 on invalid body (no items)", async () => {
    const res = await POST(
      new Request("http://localhost/api/doctor/booking-engine/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Шаблон",
          priceMinor: 5000,
          items: [], // min 1
        }),
      }),
    );
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_body");
  });

  it("POST returns 403 when not authenticated", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
    });
    const res = await POST(
      new Request("http://localhost/api/doctor/booking-engine/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "X",
          priceMinor: 0,
          items: [{ serviceId: SERVICE_ID, quantity: 1 }],
        }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
