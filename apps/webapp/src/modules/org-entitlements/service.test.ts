import { describe, expect, it, vi } from "vitest";
import type { OrgEntitlementsPort } from "./ports";
import {
  createPlatformEntitlementsService,
  evaluateQuotaGrowth,
  isMechanicEnabled,
  resolveClinicSeatLimit,
  resolveOrgEntitlements,
} from "./service";
import { MECHANICS } from "./types";

function portFor(
  tariff: { mechanics: Record<string, boolean>; includedSeats?: number | null } | null,
  overrides: { mechanic: string; enabled: boolean; seatLimitOverride?: number | null; expiresAt?: string | null }[],
): OrgEntitlementsPort {
  const totalGrowth = (growthByUnit: Parameters<OrgEntitlementsPort["reserveQuotaGrowth"]>[2]) => {
    let total = 0;
    for (const value of Object.values(growthByUnit)) total += value ?? 0;
    return total;
  };
  return {
    getTariffForOrg: vi.fn(async () =>
      tariff ? { mechanics: tariff.mechanics, includedSeats: tariff.includedSeats ?? null } : null,
    ),
    listOverrides: vi.fn(async () =>
      overrides.map((override) => ({ ...override, seatLimitOverride: override.seatLimitOverride ?? null })),
    ),
    getEffectiveCommercialAccess: vi.fn(async () => ({
      lifecycle: "active" as const,
      tariffId: null,
      source: "compatibility" as const,
    })),
    reserveQuotaGrowth: vi.fn(async (_organizationId, mechanic, growthByUnit) => ({
      allowed: true,
      warning: false,
      used: 0,
      projected: totalGrowth(growthByUnit),
      limit: null,
      utilizationPercent: null,
      reason: "allowed" as const,
      mechanic,
      periodKey: null,
      reserved: totalGrowth(growthByUnit),
    })),
  };
}

describe("resolveOrgEntitlements", () => {
  it("defaults compatibility mechanics to enabled but paid capabilities to disabled without tariff or overrides", async () => {
    const result = await resolveOrgEntitlements(portFor(null, []), "legacy-org");
    for (const mechanic of MECHANICS) {
      if (mechanic === "clinic_team" || mechanic === "courses" || mechanic === "exercise_catalog") continue;
      expect(result[mechanic]).toBe(true);
    }
    expect(result.clinic_team).toBe(false);
    expect(result.courses).toBe(false);
    expect(result.exercise_catalog).toBe(false);
  });

  it("enables clinic_team once a tariff explicitly turns it on", async () => {
    const result = await resolveOrgEntitlements(portFor({ mechanics: { clinic_team: true } }, []), "org-a");
    expect(result.clinic_team).toBe(true);
  });

  it("lets an org override enable clinic_team with no tariff", async () => {
    const result = await resolveOrgEntitlements(
      portFor(null, [{ mechanic: "clinic_team", enabled: true }]),
      "org-a",
    );
    expect(result.clinic_team).toBe(true);
  });

  it("uses assigned tariff values", async () => {
    const result = await resolveOrgEntitlements(portFor({ mechanics: { courses: false } }, []), "org-a");
    expect(result.courses).toBe(false);
  });

  it("lets an organization override win over an assigned tariff", async () => {
    const result = await resolveOrgEntitlements(
      portFor({ mechanics: { courses: false } }, [{ mechanic: "courses", enabled: true }]),
      "org-a",
    );
    expect(result.courses).toBe(true);
  });

  it("ignores an expired organization override", async () => {
    const result = await resolveOrgEntitlements(
      portFor(
        { mechanics: { courses: false } },
        [{ mechanic: "courses", enabled: true, expiresAt: "2020-01-01T00:00:00.000Z" }],
      ),
      "org-a",
    );
    expect(result.courses).toBe(false);
  });

  it("keeps courses fail-closed for an unassigned organization", async () => {
    const result = await resolveOrgEntitlements(portFor(null, []), "legacy-org");
    expect(result.courses).toBe(false);
  });

  it("does not leak an override from organization A into organization B", async () => {
    const ports = new Map<string, OrgEntitlementsPort>([
      ["org-a", portFor(null, [{ mechanic: "courses", enabled: true }])],
      ["org-b", portFor(null, [])],
    ]);
    const scopedPort: OrgEntitlementsPort = {
      getTariffForOrg: (organizationId) => ports.get(organizationId)!.getTariffForOrg(organizationId),
      listOverrides: (organizationId) => ports.get(organizationId)!.listOverrides(organizationId),
      getEffectiveCommercialAccess: (organizationId) => ports.get(organizationId)!.getEffectiveCommercialAccess(organizationId),
      reserveQuotaGrowth: (organizationId, mechanic, growthByUnit) => ports.get(organizationId)!.reserveQuotaGrowth(organizationId, mechanic, growthByUnit),
    };
    await expect(isMechanicEnabled(scopedPort, "org-a", "courses")).resolves.toBe(true);
    await expect(isMechanicEnabled(scopedPort, "org-b", "courses")).resolves.toBe(false);
  });
});

describe("isMechanicEnabled", () => {
  it("delegates to the same compatibility resolver", async () => {
    const port = portFor(null, [{ mechanic: "files", enabled: false }]);
    await expect(isMechanicEnabled(port, "org-1", "files")).resolves.toBe(false);
    await expect(isMechanicEnabled(port, "org-1", "cms_pages")).resolves.toBe(true);
  });
});

describe("resolveClinicSeatLimit", () => {
  it("returns 0 when there is no tariff and no override (clinic_team defaults off)", async () => {
    await expect(resolveClinicSeatLimit(portFor(null, []), "org-a")).resolves.toBe(0);
  });

  it("returns the fail-closed baseline when clinic_team is enabled but no seat count is configured", async () => {
    const port = portFor({ mechanics: { clinic_team: true } }, []);
    await expect(resolveClinicSeatLimit(port, "org-a")).resolves.toBe(1);
  });

  it("returns 0 when a tariff sets includedSeats but does not enable clinic_team", async () => {
    const port = portFor({ mechanics: { clinic_team: false }, includedSeats: 5 }, []);
    await expect(resolveClinicSeatLimit(port, "org-a")).resolves.toBe(0);
  });

  it("uses the tariff's includedSeats when there is no override", async () => {
    const port = portFor({ mechanics: { clinic_team: true }, includedSeats: 3 }, []);
    await expect(resolveClinicSeatLimit(port, "org-a")).resolves.toBe(3);
  });

  it("lets an org-level seat override win over the tariff value", async () => {
    const port = portFor(
      { mechanics: { clinic_team: true }, includedSeats: 3 },
      [{ mechanic: "clinic_team", enabled: true, seatLimitOverride: 7 }],
    );
    await expect(resolveClinicSeatLimit(port, "org-a")).resolves.toBe(7);
  });

  it("ignores an override row for an unrelated mechanic", async () => {
    const port = portFor(
      { mechanics: { clinic_team: true }, includedSeats: 3 },
      [{ mechanic: "courses", enabled: false, seatLimitOverride: 99 }],
    );
    await expect(resolveClinicSeatLimit(port, "org-a")).resolves.toBe(3);
  });

  it("lets an org override disable clinic_team even when the tariff enables it, returning 0", async () => {
    const port = portFor(
      { mechanics: { clinic_team: true }, includedSeats: 3 },
      [{ mechanic: "clinic_team", enabled: false }],
    );
    await expect(resolveClinicSeatLimit(port, "org-a")).resolves.toBe(0);
  });

  it("does not leak an override from organization A into organization B", async () => {
    const ports = new Map<string, OrgEntitlementsPort>([
      ["org-a", portFor(null, [{ mechanic: "clinic_team", enabled: true, seatLimitOverride: 5 }])],
      ["org-b", portFor(null, [])],
    ]);
    const scopedPort: OrgEntitlementsPort = {
      getTariffForOrg: (organizationId) => ports.get(organizationId)!.getTariffForOrg(organizationId),
      listOverrides: (organizationId) => ports.get(organizationId)!.listOverrides(organizationId),
      getEffectiveCommercialAccess: (organizationId) => ports.get(organizationId)!.getEffectiveCommercialAccess(organizationId),
      reserveQuotaGrowth: (organizationId, mechanic, growthByUnit) => ports.get(organizationId)!.reserveQuotaGrowth(organizationId, mechanic, growthByUnit),
    };
    await expect(resolveClinicSeatLimit(scopedPort, "org-a")).resolves.toBe(5);
    await expect(resolveClinicSeatLimit(scopedPort, "org-b")).resolves.toBe(0);
  });
});

describe("quota growth policy", () => {
  const numeric = {
    kind: "numeric" as const,
    limit: 100,
    unit: "items",
    period: "month" as const,
    usagePolicy: "consumption" as const,
  };

  it("warns at 80 percent without blocking existing access", () => {
    expect(evaluateQuotaGrowth({ quota: numeric, used: 79, growth: 1 })).toMatchObject({
      allowed: true,
      warning: true,
      reason: "warning_80",
    });
  });

  it("blocks only new growth above the limit", () => {
    expect(evaluateQuotaGrowth({ quota: numeric, used: 100, growth: 1 })).toMatchObject({
      allowed: false,
      reason: "quota_reached",
    });
    expect(evaluateQuotaGrowth({ quota: numeric, used: 120, growth: 0 })).toMatchObject({
      allowed: true,
      reason: "warning_80",
    });
  });

  it("never blocks an explicit unlimited quota", () => {
    expect(evaluateQuotaGrowth({
      quota: { ...numeric, kind: "unlimited", limit: null },
      used: 1_000_000,
      growth: 10,
    })).toMatchObject({ allowed: true, limit: null });
  });
});

describe("platform tariff constructor validation", () => {
  it("rejects blank audit reasons before a write", async () => {
    const port = { createTariff: vi.fn() };
    const service = createPlatformEntitlementsService(port as never);
    expect(() => service.createTariff({
      name: "Base",
      description: "",
      priceMinor: 1000,
      currency: "rub",
      billingPeriod: "month",
      mechanics: {},
      quotas: {},
      includedSeats: 1,
      isActive: true,
    }, { actorId: null, reason: " " })).toThrow("commercial_change_reason_required");
    expect(port.createTariff).not.toHaveBeenCalled();
  });

  it("rejects a quota unit not registered for the mechanic", async () => {
    const port = { createTariff: vi.fn() };
    const service = createPlatformEntitlementsService(port as never);
    expect(() => service.createTariff({
      name: "Base",
      description: "",
      priceMinor: null,
      currency: null,
      billingPeriod: "month",
      mechanics: { booking: true },
      quotas: { booking: { kind: "numeric", limit: 10, unit: "bytes", period: "month", usagePolicy: "consumption" } },
      includedSeats: null,
      isActive: true,
    }, { actorId: null, reason: "test" })).toThrow("tariff_quota_unit_invalid");
  });
});
