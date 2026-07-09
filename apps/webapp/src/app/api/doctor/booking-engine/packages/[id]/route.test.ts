import { describe, expect, it, vi, beforeEach } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const getCatalogPackageMock = vi.hoisted(() => vi.fn());
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

vi.mock("../../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    memberships: {
      getCatalogPackage: getCatalogPackageMock,
      upsertCatalogPackage: upsertCatalogPackageMock,
    },
  }),
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

import { GET, PATCH } from "./route";

const PKG_ID = "550e8400-e29b-41d4-a716-446655440020";

const basePkg = {
  id: PKG_ID,
  organizationId: "org-1",
  title: "Абонемент А",
  description: null,
  priceMinor: 10000,
  currency: "RUB",
  validityDays: 30,
  deductionMode: "auto_on_visit_confirmed" as const,
  isActive: true,
  items: [{ id: "i-1", serviceId: "550e8400-e29b-41d4-a716-446655440001", quantity: 5, sortOrder: 0 }],
};

describe("/api/doctor/booking-engine/packages/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1", session: { user: { userId: "u1" } } },
    });
    getCatalogPackageMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
      return basePkg;
    });
  });

  it("GET returns the package", async () => {
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: PKG_ID }),
    });
    const json = (await res.json()) as { ok?: boolean; package?: typeof basePkg };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.package?.id).toBe(PKG_ID);
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it("GET returns 404 when not found", async () => {
    getCatalogPackageMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: PKG_ID }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("not_found");
  });

  it("PATCH deactivates the package", async () => {
    const updated = { ...basePkg, isActive: false };
    upsertCatalogPackageMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return updated;
    });
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      { params: Promise.resolve({ id: PKG_ID }) },
    );
    const json = (await res.json()) as { ok?: boolean; package?: { isActive?: boolean } };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.package?.isActive).toBe(false);
    expect(upsertCatalogPackageMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: PKG_ID, isActive: false }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      "doctor.booking-engine.packages.patch",
      expect.any(Function),
    );
  });

  it("PATCH returns 404 when package not found", async () => {
    getCatalogPackageMock.mockResolvedValue(null);
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      { params: Promise.resolve({ id: PKG_ID }) },
    );
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(404);
    expect(json.error).toBe("not_found");
  });

  it("PATCH returns 403 when not authenticated", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
    });
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      { params: Promise.resolve({ id: PKG_ID }) },
    );
    expect(res.status).toBe(403);
  });

  it("PATCH rejects invalid body", async () => {
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: "not-a-boolean" }),
      }),
      { params: Promise.resolve({ id: PKG_ID }) },
    );
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_body");
  });
});
