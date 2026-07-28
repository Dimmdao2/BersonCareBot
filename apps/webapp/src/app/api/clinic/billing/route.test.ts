import { beforeEach, describe, expect, it, vi } from "vitest";

const guardMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());
const getOrganizationBillingOverviewMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireClinicManagementApiContext: guardMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { GET } from "./route";

const OWNER_ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const FOREIGN_ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  buildAppDepsMock.mockReturnValue({
    saasBilling: {
      getOrganizationBillingOverview: getOrganizationBillingOverviewMock,
    },
  });
});

describe("GET /api/clinic/billing", () => {
  it("returns only the organization resolved from the owner membership", async () => {
    const billing = {
      organizationId: OWNER_ORGANIZATION_ID,
      subscriptions: [],
      invoices: [],
      providerEvents: [],
    };
    guardMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: OWNER_ORGANIZATION_ID,
        membershipRole: "owner",
      },
    });
    getOrganizationBillingOverviewMock.mockResolvedValue(billing);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      billing: {
        organizationId: OWNER_ORGANIZATION_ID,
        subscriptions: [],
        invoices: [],
      },
    });
    expect(getOrganizationBillingOverviewMock).toHaveBeenCalledWith(OWNER_ORGANIZATION_ID);
    expect(getOrganizationBillingOverviewMock).not.toHaveBeenCalledWith(FOREIGN_ORGANIZATION_ID);
    expect(guardMock.mock.invocationCallOrder[0]).toBeLessThan(
      buildAppDepsMock.mock.invocationCallOrder[0]!,
    );
  });

  it("denies an ordinary doctor from a foreign clinic before billing repository access", async () => {
    guardMock.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it("keeps the billing role narrower than general clinic management", async () => {
    guardMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: OWNER_ORGANIZATION_ID,
        membershipRole: "admin",
      },
    });

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "billing_owner_required",
    });
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });
});
