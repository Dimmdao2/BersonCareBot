import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DoctorWorkspaceAccessContext } from "@/app-layer/guards/requireRole";
import type { OrgEntitlementsPort } from "@/modules/org-entitlements/ports";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const getTariffForOrgMock = vi.hoisted(() => vi.fn());
const listOverridesMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    orgEntitlements: {
      getTariffForOrg: getTariffForOrgMock,
      listOverrides: listOverridesMock,
    } satisfies OrgEntitlementsPort,
  })),
}));

import { requireEntitlement } from "./requireEntitlement";

const workspaceCtx: DoctorWorkspaceAccessContext = {
  session: {
    user: {
      userId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      role: "doctor",
      displayName: "Doctor",
      bindings: {},
    },
    issuedAt: 1,
    expiresAt: 9e9,
  },
  organizationId: "11111111-1111-4111-8111-111111111111",
  membershipId: "membership-1",
  membershipRole: "doctor",
  specialistId: "specialist-1",
  canManageOrganization: false,
  canManageAllSpecialists: false,
};

beforeEach(() => {
  requireDoctorWorkspaceApiContextMock.mockReset();
  getTariffForOrgMock.mockReset();
  listOverridesMock.mockReset();
});

describe("requireEntitlement", () => {
  it("returns ok with the resolved doctor workspace context when mechanic is enabled by default", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({ ok: true, ctx: workspaceCtx });
    getTariffForOrgMock.mockResolvedValueOnce(null);
    listOverridesMock.mockResolvedValueOnce([]);

    const gate = await requireEntitlement("courses");

    expect(gate).toEqual({ ok: true, ctx: workspaceCtx });
    expect(getTariffForOrgMock).toHaveBeenCalledWith(workspaceCtx.organizationId);
    expect(listOverridesMock).toHaveBeenCalledWith(workspaceCtx.organizationId);
  });

  it("returns 403 entitlement_required when mechanic is disabled by an override", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({ ok: true, ctx: workspaceCtx });
    getTariffForOrgMock.mockResolvedValueOnce(null);
    listOverridesMock.mockResolvedValueOnce([{ mechanic: "courses", enabled: false }]);

    const gate = await requireEntitlement("courses");

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    await expect(gate.response.json()).resolves.toEqual({
      ok: false,
      error: "entitlement_required",
      mechanic: "courses",
    });
  });
});
