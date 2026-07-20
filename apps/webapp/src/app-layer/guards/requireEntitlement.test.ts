import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgEntitlementsPort } from "@/modules/org-entitlements/ports";

const getTariffForOrgMock = vi.hoisted(() => vi.fn());
const listOverridesMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    orgEntitlements: {
      getTariffForOrg: getTariffForOrgMock,
      listOverrides: listOverridesMock,
    } satisfies OrgEntitlementsPort,
  })),
}));

import { requireEntitlement, requireEntitlementForAction } from "./requireEntitlement";

const workspaceCtx = {
  organizationId: "11111111-1111-4111-8111-111111111111",
};

beforeEach(() => {
  getTariffForOrgMock.mockReset();
  listOverridesMock.mockReset();
});

describe("requireEntitlement", () => {
  it("uses the supplied trusted context and has no auth side effect", async () => {
    getTariffForOrgMock.mockResolvedValueOnce(null);
    listOverridesMock.mockResolvedValueOnce([{ mechanic: "courses", enabled: true }]);

    const gate = await requireEntitlement(workspaceCtx, "courses");

    expect(gate).toEqual({ ok: true });
    expect(getTariffForOrgMock).toHaveBeenCalledWith(workspaceCtx.organizationId);
    expect(listOverridesMock).toHaveBeenCalledWith(workspaceCtx.organizationId);
  });

  it("returns 403 entitlement_required when mechanic is disabled by an override", async () => {
    getTariffForOrgMock.mockResolvedValueOnce(null);
    listOverridesMock.mockResolvedValueOnce([{ mechanic: "courses", enabled: false }]);

    const gate = await requireEntitlement(workspaceCtx, "courses");

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    await expect(gate.response.json()).resolves.toEqual({
      ok: false,
      error: "entitlement_required",
      mechanic: "courses",
    });
  });

  it("uses the same resolver through the Server Action adapter without NextResponse", async () => {
    getTariffForOrgMock.mockResolvedValueOnce(null);
    listOverridesMock.mockResolvedValueOnce([{ mechanic: "mailings", enabled: false }]);

    await expect(requireEntitlementForAction(workspaceCtx, "mailings")).resolves.toEqual({
      ok: false,
      mechanic: "mailings",
    });
  });
});
