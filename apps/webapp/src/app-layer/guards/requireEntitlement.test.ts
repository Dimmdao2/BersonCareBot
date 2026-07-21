import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgEntitlementsPort } from "@/modules/org-entitlements/ports";

const getTariffForOrgMock = vi.hoisted(() => vi.fn());
const listOverridesMock = vi.hoisted(() => vi.fn());
const getEffectiveCommercialAccessMock = vi.hoisted(() => vi.fn());
const reserveQuotaGrowthMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    orgEntitlements: {
      getTariffForOrg: getTariffForOrgMock,
      listOverrides: listOverridesMock,
      getEffectiveCommercialAccess: getEffectiveCommercialAccessMock,
      reserveQuotaGrowth: reserveQuotaGrowthMock,
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
  getEffectiveCommercialAccessMock.mockReset();
  reserveQuotaGrowthMock.mockReset();
  getEffectiveCommercialAccessMock.mockResolvedValue({
    lifecycle: "active",
    tariffId: null,
    source: "compatibility",
  });
});

describe("requireEntitlement", () => {
  it("uses the supplied trusted context and has no auth side effect", async () => {
    getTariffForOrgMock.mockResolvedValueOnce(null);
    listOverridesMock.mockResolvedValueOnce([{ mechanic: "courses", enabled: true }]);

    const gate = await requireEntitlement(workspaceCtx, "courses");

    expect(gate).toEqual({ ok: true, quota: null });
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
      quota: null,
    });
  });

  it("uses the same resolver through the Server Action adapter without NextResponse", async () => {
    getTariffForOrgMock.mockResolvedValueOnce(null);
    listOverridesMock.mockResolvedValueOnce([{ mechanic: "mailings", enabled: false }]);

    await expect(requireEntitlementForAction(workspaceCtx, "mailings")).resolves.toEqual({
      ok: false,
      mechanic: "mailings",
      reason: "entitlement_required",
    });
  });

  it("allows reads in read-only lifecycle but rejects mutations", async () => {
    getTariffForOrgMock.mockResolvedValue(null);
    listOverridesMock.mockResolvedValue([{ mechanic: "files", enabled: true }]);
    getEffectiveCommercialAccessMock.mockResolvedValue({
      lifecycle: "read_only",
      tariffId: null,
      source: "trial",
    });

    await expect(requireEntitlement(workspaceCtx, "files")).resolves.toEqual({
      ok: true,
      quota: null,
    });
    const mutation = await requireEntitlement(workspaceCtx, "files", { kind: "mutation" });
    expect(mutation.ok).toBe(false);
    if (mutation.ok) return;
    await expect(mutation.response.json()).resolves.toMatchObject({
      error: "commercial_read_only",
    });
  });

  it("returns the atomic quota decision and never reserves for a read", async () => {
    getTariffForOrgMock.mockResolvedValue(null);
    listOverridesMock.mockResolvedValue([{ mechanic: "files", enabled: true }]);
    reserveQuotaGrowthMock.mockResolvedValue({
      allowed: false,
      warning: true,
      used: 100,
      projected: 101,
      limit: 100,
      utilizationPercent: 101,
      reason: "quota_reached",
      mechanic: "files",
      periodKey: "2026-07",
      reserved: 0,
    });

    await requireEntitlement(workspaceCtx, "files");
    expect(reserveQuotaGrowthMock).not.toHaveBeenCalled();

    const mutation = await requireEntitlement(workspaceCtx, "files", {
      kind: "mutation",
      growthByUnit: { items: 1 },
    });
    expect(mutation.ok).toBe(false);
    expect(reserveQuotaGrowthMock).toHaveBeenCalledWith(
      workspaceCtx.organizationId,
      "files",
      { items: 1 },
    );
    if (mutation.ok) return;
    await expect(mutation.response.json()).resolves.toMatchObject({
      error: "quota_reached",
      quota: { reserved: 0, used: 100 },
    });
  });
});
