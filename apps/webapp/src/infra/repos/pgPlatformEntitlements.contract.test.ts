/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORM_OPERATIONS_DB_SOURCE } from "@/shared/security/platformOperationsPrincipal";

const getCurrentDbPrincipalMock = vi.hoisted(() => vi.fn());
const getDrizzleMock = vi.hoisted(() => vi.fn());

vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipal: getCurrentDbPrincipalMock,
}));
vi.mock("@/app-layer/db/drizzle", () => ({ getDrizzle: getDrizzleMock }));

import { createPgPlatformEntitlementsPort } from "./pgPlatformEntitlements";

describe("platform commercial persistence boundary", () => {
  beforeEach(() => {
    getCurrentDbPrincipalMock.mockReset();
    getDrizzleMock.mockReset();
    getCurrentDbPrincipalMock.mockReturnValue({
      kind: "platform",
      platformUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      source: PLATFORM_OPERATIONS_DB_SOURCE,
    });
  });

  it("returns the persisted typed organization commercial state through the capability", async () => {
    const rows = [{
      id: "11111111-1111-4111-8111-111111111111",
      title: "Клиника",
      tariffId: null,
      isActive: true,
      commercialAccessState: "no_trial",
    }];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const from = vi.fn(() => ({ orderBy }));
    const select = vi.fn(() => ({ from }));
    getDrizzleMock.mockReturnValue({ select });

    await expect(createPgPlatformEntitlementsPort().listOrganizations()).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledOnce();
    expect(orderBy).toHaveBeenCalledOnce();
  });

  it("maps arbitrary persisted tariff mechanics and typed quotas without a product default", async () => {
    const persisted = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Custom",
      description: "",
      priceMinor: null,
      currency: null,
      billingPeriod: "year",
      mechanics: { files: true, courses: false },
      quotas: {
        files: {
          kind: "numeric",
          limit: 4096,
          unit: "bytes",
          period: "month",
          usagePolicy: "consumption",
        },
      },
      includedSeats: null,
      isActive: true,
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:00.000Z",
    };
    const orderBy = vi.fn().mockResolvedValue([persisted]);
    const from = vi.fn(() => ({ orderBy }));
    getDrizzleMock.mockReturnValue({ select: vi.fn(() => ({ from })) });

    await expect(createPgPlatformEntitlementsPort().listTariffs()).resolves.toEqual([persisted]);
  });
});
