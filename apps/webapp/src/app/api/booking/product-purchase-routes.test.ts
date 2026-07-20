import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePatientApiBusinessAccessMock = vi.hoisted(() => vi.fn());
const resolveActiveOrganizationForPatientMock = vi.hoisted(() => vi.fn());
const resolveProductOrganizationIdMock = vi.hoisted(() => vi.fn());
const resolvePayLinkMock = vi.hoisted(() => vi.fn());
const startPurchaseMock = vi.hoisted(() => vi.fn());
const linkPurchasesForUserMock = vi.hoisted(() => vi.fn());
const withExplicitOrganizationPrincipalMock = vi.hoisted(() =>
  vi.fn(async <T,>(_context: unknown, fn: () => Promise<T>) => fn()),
);

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: requirePatientApiBusinessAccessMock,
}));

vi.mock("@/app-layer/principal/bootstrapPrincipal", () => ({
  stampBootstrapPrincipal: vi.fn(),
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withExplicitOrganizationPrincipal: withExplicitOrganizationPrincipalMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientOrganization: {
      resolveActiveOrganizationForPatient: resolveActiveOrganizationForPatientMock,
    },
    products: {
      resolveProductOrganizationId: resolveProductOrganizationIdMock,
      resolvePayLink: resolvePayLinkMock,
      startPurchase: startPurchaseMock,
      linkPurchasesForUser: linkPurchasesForUserMock,
    },
  }),
}));

import { POST as purchaseAsPatient } from "./products/purchase/route";
import { POST as purchaseFromPublicLink } from "./public/products/purchase/route";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRODUCT_ID = "550e8400-e29b-41d4-a716-446655440042";

describe("course product purchase tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePatientApiBusinessAccessMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "patient-1", role: "client", phone: "+79990001122" } },
    });
    resolveActiveOrganizationForPatientMock.mockResolvedValue({ ok: true, organizationId: ORG_A });
    startPurchaseMock.mockResolvedValue({ purchase: { id: "purchase-1" } });
  });

  it("does not let an authenticated patient select an organization through productId", async () => {
    resolveProductOrganizationIdMock.mockResolvedValue(ORG_B);
    const response = await purchaseAsPatient(
      new Request("http://localhost/api/booking/products/purchase", {
        method: "POST",
        body: JSON.stringify({ productId: PRODUCT_ID }),
      }),
    );

    expect(response.status).toBe(404);
    expect(startPurchaseMock).not.toHaveBeenCalled();
    expect(withExplicitOrganizationPrincipalMock).not.toHaveBeenCalled();
  });

  it("stamps the authenticated patient's active enrollment organization", async () => {
    resolveProductOrganizationIdMock.mockResolvedValue(ORG_A);
    const response = await purchaseAsPatient(
      new Request("http://localhost/api/booking/products/purchase", {
        method: "POST",
        body: JSON.stringify({ productId: PRODUCT_ID }),
      }),
    );

    expect(response.status).toBe(200);
    expect(withExplicitOrganizationPrincipalMock).toHaveBeenCalledWith(
      { organizationId: ORG_A, source: "api/booking/products/purchase:POST" },
      expect.any(Function),
    );
    expect(startPurchaseMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_A, productId: PRODUCT_ID, platformUserId: "patient-1" }),
    );
  });

  it("derives public purchase scope from the stored pay link and ignores a supplied user id", async () => {
    resolvePayLinkMock.mockResolvedValue({
      id: "link-1",
      organizationId: ORG_A,
      product: { id: PRODUCT_ID },
    });
    const response = await purchaseFromPublicLink(
      new Request("http://localhost/api/booking/public/products/purchase", {
        method: "POST",
        body: JSON.stringify({
          productId: PRODUCT_ID,
          payLinkToken: "trusted-token",
          buyerPhone: "+79990001122",
          platformUserId: "550e8400-e29b-41d4-a716-446655440099",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(resolveProductOrganizationIdMock).not.toHaveBeenCalled();
    expect(startPurchaseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A,
        productId: PRODUCT_ID,
        platformUserId: null,
        payLinkToken: "trusted-token",
      }),
    );
  });
});
