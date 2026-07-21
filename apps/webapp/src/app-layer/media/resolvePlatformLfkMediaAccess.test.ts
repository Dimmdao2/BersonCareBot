import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentDbPrincipalOrganizationIdMock,
  requireEntitlementForReadActionMock,
  pgCanReadPlatformLfkMediaMock,
} = vi.hoisted(() => ({
  getCurrentDbPrincipalOrganizationIdMock: vi.fn(),
  requireEntitlementForReadActionMock: vi.fn(),
  pgCanReadPlatformLfkMediaMock: vi.fn(),
}));

vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipalOrganizationId: () => getCurrentDbPrincipalOrganizationIdMock(),
}));

vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlementForReadAction: (...args: unknown[]) =>
    requireEntitlementForReadActionMock(...args),
}));

vi.mock("@/infra/repos/pgPlatformLfkMediaAccess", () => ({
  pgCanReadPlatformLfkMedia: (...args: unknown[]) => pgCanReadPlatformLfkMediaMock(...args),
}));

import { resolvePlatformLfkMediaAccess } from "./resolvePlatformLfkMediaAccess";

const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";

describe("resolvePlatformLfkMediaAccess", () => {
  beforeEach(() => {
    getCurrentDbPrincipalOrganizationIdMock.mockReset();
    requireEntitlementForReadActionMock.mockReset();
    pgCanReadPlatformLfkMediaMock.mockReset();
  });

  it("fails closed before entitlement or media lookup without an organization principal", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(null);

    await expect(resolvePlatformLfkMediaAccess("media-1")).resolves.toBe(false);

    expect(requireEntitlementForReadActionMock).not.toHaveBeenCalled();
    expect(pgCanReadPlatformLfkMediaMock).not.toHaveBeenCalled();
  });

  it("uses the exact principal organization for the read entitlement projection", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORGANIZATION_ID);
    requireEntitlementForReadActionMock.mockResolvedValue({ ok: true });
    pgCanReadPlatformLfkMediaMock.mockResolvedValue(true);

    await expect(resolvePlatformLfkMediaAccess("media-1")).resolves.toBe(true);

    expect(requireEntitlementForReadActionMock).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID },
      "exercise_catalog",
    );
    expect(pgCanReadPlatformLfkMediaMock).toHaveBeenCalledWith("media-1", true);
  });

  it("keeps platform media unavailable when the principal organization lacks the mechanic", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORGANIZATION_ID);
    requireEntitlementForReadActionMock.mockResolvedValue({
      ok: false,
      mechanic: "exercise_catalog",
      reason: "entitlement_required",
    });
    pgCanReadPlatformLfkMediaMock.mockResolvedValue(false);

    await expect(resolvePlatformLfkMediaAccess("media-1")).resolves.toBe(false);

    expect(pgCanReadPlatformLfkMediaMock).toHaveBeenCalledWith("media-1", false);
  });
});
