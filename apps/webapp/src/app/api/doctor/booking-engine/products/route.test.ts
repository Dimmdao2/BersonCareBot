import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const listStaffProductsMock = vi.hoisted(() => vi.fn());
const upsertProductMock = vi.hoisted(() => vi.fn());
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
    products: {
      listStaffProducts: listStaffProductsMock,
      upsertProduct: upsertProductMock,
    },
  }),
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

import { GET, POST } from "./route";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const product = {
  id: "550e8400-e29b-41d4-a716-446655440040",
  organizationId: ORG,
  productType: "single_visit" as const,
  title: "Single visit",
  description: null,
  priceMinor: 5000,
  currency: "RUB",
  compositionJson: {},
  accessRulesJson: {},
  paymentRulesJson: {},
  validityDays: null,
  courseId: null,
  subscriptionPackageId: null,
  showInPatientCatalog: true,
  payByLinkEnabled: false,
  isActive: true,
};

describe("/api/doctor/booking-engine/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORG, session: { user: { userId: "u1" } } },
    });
    listStaffProductsMock.mockResolvedValue([product]);
    upsertProductMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return product;
    });
  });

  it("GET lists products without principal wrapper", async () => {
    const res = await GET();
    const json = (await res.json()) as { ok?: boolean; products?: typeof product[] };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.products).toHaveLength(1);
    expect(listStaffProductsMock).toHaveBeenCalledWith(ORG);
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it("POST upserts a product inside doctor workspace principal", async () => {
    const res = await POST(
      new Request("http://localhost/api/doctor/booking-engine/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productType: "single_visit",
          title: "Single visit",
          priceMinor: 5000,
          isActive: true,
        }),
      }),
    );
    const json = (await res.json()) as { ok?: boolean; product?: typeof product };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.product?.id).toBe(product.id);
    expect(upsertProductMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        productType: "single_visit",
        title: "Single visit",
        priceMinor: 5000,
      }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG }),
      "doctor.booking-engine.products.upsert",
      expect.any(Function),
    );
  });

  it("POST returns a controlled rejection for a foreign course product", async () => {
    upsertProductMock.mockRejectedValueOnce(new Error("course_not_found"));
    const res = await POST(
      new Request("http://localhost/api/doctor/booking-engine/products", {
        method: "POST",
        body: JSON.stringify({
          productType: "course",
          title: "Course",
          priceMinor: 5000,
          courseId: "550e8400-e29b-41d4-a716-446655440099",
        }),
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "course_not_found" });
  });
});
