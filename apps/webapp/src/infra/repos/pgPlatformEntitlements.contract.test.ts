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
    const organizationRows = [{
      id: "11111111-1111-4111-8111-111111111111",
      title: "Клиника",
      tariffId: null,
      isActive: true,
      commercialAccessState: "no_trial",
    }];
    const organizationOrderBy = vi.fn().mockResolvedValue(organizationRows);
    const organizationFrom = vi.fn(() => ({ orderBy: organizationOrderBy }));
    const trialFrom = vi.fn().mockResolvedValue([]);
    const overrideFrom = vi.fn().mockResolvedValue([]);
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: organizationFrom })
      .mockReturnValueOnce({ from: trialFrom })
      .mockReturnValueOnce({ from: overrideFrom });
    getDrizzleMock.mockReturnValue({
      transaction: (callback: (tx: { select: typeof select }) => unknown) => callback({ select }),
    });

    await expect(createPgPlatformEntitlementsPort().listOrganizations()).resolves.toEqual([
      {
        ...organizationRows[0],
        effectiveAccess: { lifecycle: "active", tariffId: null, source: "no_trial" },
        overrides: [],
        trial: null,
      },
    ]);
    expect(select).toHaveBeenCalledTimes(3);
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

  it("refuses to extend a trial unless the persisted row is active", async () => {
    const update = vi.fn();
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
        })),
      })),
      update,
    };
    getDrizzleMock.mockReturnValue({
      transaction: (callback: (value: typeof tx) => unknown) => callback(tx),
    });

    await expect(
      createPgPlatformEntitlementsPort().extendTrial(
        "11111111-1111-4111-8111-111111111111",
        3,
        { actorId: null, reason: "support" },
      ),
    ).rejects.toThrow("organization_trial_not_found");
    expect(update).not.toHaveBeenCalled();
  });
});
