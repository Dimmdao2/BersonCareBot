/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentDbPrincipalMock = vi.hoisted(() => vi.fn());
const getDrizzleMock = vi.hoisted(() => vi.fn());

vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipal: getCurrentDbPrincipalMock,
  runWithDbOrganizationPrincipal: (_organizationId: string, fn: () => unknown) => fn(),
}));
vi.mock("@/app-layer/db/drizzle", () => ({ getDrizzle: getDrizzleMock }));

import { createPgPlatformEntitlementsPort } from "./pgPlatformEntitlements";

describe("pgPlatformEntitlements principal boundary", () => {
  beforeEach(() => {
    getCurrentDbPrincipalMock.mockReset();
    getDrizzleMock.mockReset();
  });

  it("rejects an ordinary organization principal before DB checkout", async () => {
    getCurrentDbPrincipalMock.mockReturnValue({ kind: "organization", organizationId: "org-a" });

    await expect(createPgPlatformEntitlementsPort().listTariffs()).rejects.toThrow(
      "platform_operations_principal_required",
    );
    expect(getDrizzleMock).not.toHaveBeenCalled();
  });

  it("rejects an unrelated bootstrap source before DB checkout", async () => {
    getCurrentDbPrincipalMock.mockReturnValue({ kind: "bootstrap", source: "public-login" });

    await expect(createPgPlatformEntitlementsPort().listOrganizations()).rejects.toThrow(
      "platform_operations_principal_required",
    );
    expect(getDrizzleMock).not.toHaveBeenCalled();
  });
});
