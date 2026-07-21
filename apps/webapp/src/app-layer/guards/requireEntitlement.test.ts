import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgEntitlementsPort } from "@/modules/org-entitlements/ports";

const getTariffForOrgMock = vi.hoisted(() => vi.fn());
const listOverridesMock = vi.hoisted(() => vi.fn());
const getEffectiveCommercialAccessMock = vi.hoisted(() => vi.fn());
const getSnapshotMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    orgEntitlements: {
      getTariffForOrg: getTariffForOrgMock,
      listOverrides: listOverridesMock,
      getEffectiveCommercialAccess: getEffectiveCommercialAccessMock,
      getSnapshot: getSnapshotMock,
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
  getSnapshotMock.mockReset();
  getEffectiveCommercialAccessMock.mockResolvedValue({
    lifecycle: "active",
    tariffId: null,
    source: "compatibility",
  });
  getSnapshotMock.mockResolvedValue({
    tariff: null,
    overrides: [],
    access: { lifecycle: "active", tariffId: null, source: "compatibility" },
  });
});

describe("requireEntitlement", () => {
  it("uses the supplied trusted context and has no auth side effect", async () => {
    getTariffForOrgMock.mockResolvedValueOnce(null);
    listOverridesMock.mockResolvedValueOnce([{ mechanic: "courses", enabled: true }]);
    getSnapshotMock.mockResolvedValueOnce({
      tariff: null,
      overrides: [{ mechanic: "courses", enabled: true, quota: null, expiresAt: null, seatLimitOverride: null }],
      access: { lifecycle: "active", tariffId: null, source: "compatibility" },
    });

    const gate = await requireEntitlement(workspaceCtx, "courses");

    expect(gate).toEqual({ ok: true });
    expect(getSnapshotMock).toHaveBeenCalledWith(workspaceCtx.organizationId);
  });

  it("returns 403 entitlement_required when mechanic is disabled by an override", async () => {
    getTariffForOrgMock.mockResolvedValueOnce(null);
    listOverridesMock.mockResolvedValueOnce([{ mechanic: "courses", enabled: false }]);
    getSnapshotMock.mockResolvedValueOnce({
      tariff: null,
      overrides: [{ mechanic: "courses", enabled: false, quota: null, expiresAt: null, seatLimitOverride: null }],
      access: { lifecycle: "active", tariffId: null, source: "compatibility" },
    });

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
    getSnapshotMock.mockResolvedValueOnce({
      tariff: null,
      overrides: [{ mechanic: "mailings", enabled: false, quota: null, expiresAt: null, seatLimitOverride: null }],
      access: { lifecycle: "active", tariffId: null, source: "compatibility" },
    });

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
    getSnapshotMock.mockResolvedValue({
      tariff: null,
      overrides: [{ mechanic: "files", enabled: true, quota: null, expiresAt: null, seatLimitOverride: null }],
      access: { lifecycle: "read_only", tariffId: null, source: "trial" },
    });

    await expect(requireEntitlement(workspaceCtx, "files")).resolves.toEqual({
      ok: true,
    });
    const mutation = await requireEntitlement(workspaceCtx, "files", { kind: "mutation" });
    expect(mutation.ok).toBe(false);
    if (mutation.ok) return;
    await expect(mutation.response.json()).resolves.toMatchObject({
      error: "commercial_read_only",
    });
  });

  it("uses the same snapshot for the mechanic and blocked lifecycle decision", async () => {
    getSnapshotMock.mockResolvedValue({
      tariff: { mechanics: { files: true }, quotas: {}, includedSeats: null },
      overrides: [],
      access: { lifecycle: "blocked", tariffId: "tariff-1", source: "trial" },
    });
    const mutation = await requireEntitlement(workspaceCtx, "files", { kind: "mutation" });
    expect(mutation.ok).toBe(false);
    expect(getSnapshotMock).toHaveBeenCalledOnce();
    if (mutation.ok) return;
    await expect(mutation.response.json()).resolves.toMatchObject({ error: "commercial_blocked" });
  });
});
