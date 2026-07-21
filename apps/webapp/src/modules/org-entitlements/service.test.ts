import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { OrgEntitlementsPort } from "./ports";
import {
  createPlatformEntitlementsService,
  isMechanicEnabled,
  resolveClinicSeatLimit,
  resolveOrgEntitlements,
  resolveOrgQuotaProjections,
} from "./service";
import { MECHANIC_REGISTRY, MECHANICS } from "./types";

function portFor(
  tariff: { mechanics: Record<string, boolean>; includedSeats?: number | null } | null,
  overrides: { mechanic: string; enabled: boolean; seatLimitOverride?: number | null; expiresAt?: string | null }[],
): OrgEntitlementsPort {
  const port: OrgEntitlementsPort = {
    getSnapshot: vi.fn(async () => ({
      tariff: tariff ? { mechanics: tariff.mechanics, quotas: {}, includedSeats: tariff.includedSeats ?? null } : null,
      overrides: overrides.map((override) => ({ ...override, quota: null, expiresAt: override.expiresAt ?? null, seatLimitOverride: override.seatLimitOverride ?? null })),
      access: { lifecycle: "active" as const, tariffId: null, source: "compatibility" as const },
    })),
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
    getEnforcedQuotaUsage: vi.fn(async () => ({})),
  };
  return port;
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

  it("fails closed for a provisioned no-trial organization instead of applying compatibility defaults", async () => {
    const port = portFor(null, []);
    port.getEffectiveCommercialAccess = vi.fn(async () => ({
      lifecycle: "active" as const,
      tariffId: null,
      source: "no_trial" as const,
    }));
    const result = await resolveOrgEntitlements(port, "new-org-without-trial-policy");
    expect(Object.values(result)).not.toContain(true);
  });

  it("does not leak an override from organization A into organization B", async () => {
    const ports = new Map<string, OrgEntitlementsPort>([
      ["org-a", portFor(null, [{ mechanic: "courses", enabled: true }])],
      ["org-b", portFor(null, [])],
    ]);
    const scopedPort: OrgEntitlementsPort = {
      getSnapshot: (organizationId) => ports.get(organizationId)!.getSnapshot(organizationId),
      getTariffForOrg: (organizationId) => ports.get(organizationId)!.getTariffForOrg(organizationId),
      listOverrides: (organizationId) => ports.get(organizationId)!.listOverrides(organizationId),
      getEffectiveCommercialAccess: (organizationId) => ports.get(organizationId)!.getEffectiveCommercialAccess(organizationId),
      getEnforcedQuotaUsage: (organizationId) => ports.get(organizationId)!.getEnforcedQuotaUsage(organizationId),
    };
    await expect(isMechanicEnabled(scopedPort, "org-a", "courses")).resolves.toBe(true);
    await expect(isMechanicEnabled(scopedPort, "org-b", "courses")).resolves.toBe(false);
  });
});

describe("resolveOrgQuotaProjections", () => {
  it("exposes the courses 80% threshold as typed state and omits unenforced keys", async () => {
    const port = portFor({ mechanics: { courses: true } }, []);
    port.getSnapshot = vi.fn(async () => ({
      tariff: {
        mechanics: { courses: true },
        quotas: { courses: { kind: "numeric" as const, limit: 5, unit: "items", period: "snapshot" as const, usagePolicy: "snapshot" as const } },
        includedSeats: null,
      },
      overrides: [],
      access: { lifecycle: "active" as const, tariffId: "tariff-a", source: "assignment" as const },
    }));
    port.getEnforcedQuotaUsage = vi.fn(async () => ({ courses: 4 }));
    await expect(resolveOrgQuotaProjections(port, "org-a")).resolves.toEqual([
      expect.objectContaining({ mechanic: "courses", usage: 4, threshold: "warning", enforcement: "atomic_snapshot" }),
    ]);
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
      getSnapshot: (organizationId) => ports.get(organizationId)!.getSnapshot(organizationId),
      getTariffForOrg: (organizationId) => ports.get(organizationId)!.getTariffForOrg(organizationId),
      listOverrides: (organizationId) => ports.get(organizationId)!.listOverrides(organizationId),
      getEffectiveCommercialAccess: (organizationId) => ports.get(organizationId)!.getEffectiveCommercialAccess(organizationId),
      getEnforcedQuotaUsage: (organizationId) => ports.get(organizationId)!.getEnforcedQuotaUsage(organizationId),
    };
    await expect(resolveClinicSeatLimit(scopedPort, "org-a")).resolves.toBe(5);
    await expect(resolveClinicSeatLimit(scopedPort, "org-b")).resolves.toBe(0);
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

  it("accepts arbitrary declared quota shapes but restricts the enforced courses quota to its atomic shape", () => {
    const port = { createTariff: vi.fn() };
    const service = createPlatformEntitlementsService(port as never);
    const base = {
      name: "Base",
      description: "",
      priceMinor: null,
      currency: null,
      billingPeriod: "month" as const,
      mechanics: { booking: true, courses: true },
      includedSeats: null,
      isActive: true,
    };
    service.createTariff({
      ...base,
      quotas: { booking: { kind: "numeric", limit: 10, unit: "appointments", period: "month", usagePolicy: "consumption" } },
    }, { actorId: null, reason: "test" });
    expect(port.createTariff).toHaveBeenCalledOnce();
    expect(() => service.createTariff({
      ...base,
      quotas: { courses: { kind: "unlimited", limit: null, unit: "items", period: "month", usagePolicy: "consumption" } },
    }, { actorId: null, reason: "test" })).toThrow("tariff_quota_enforcement_shape_invalid");
  });

  it("declares only courses as enforced and keeps the SQL path tied to the successful insert", () => {
    expect(MECHANIC_REGISTRY.courses.quotaEnforcement).toBe("atomic_snapshot");
    expect(MECHANIC_REGISTRY.booking.quotaEnforcement).toBe("declared_no_enforcement");
    const migration = readFileSync(
      resolve(process.cwd(), "db/drizzle-migrations/0223_saas_tariff_quotas_trial.sql"),
      "utf8",
    );
    expect(migration).toContain("CREATE TRIGGER courses_snapshot_quota_guard");
    expect(migration).toContain("AFTER INSERT ON public.courses");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("SELECT count(*) INTO v_count");
    expect(migration).toContain("v_count * 5 >= v_limit * 4");
    expect(migration).toContain("saas_quota_reached:courses");
    expect(migration).not.toContain("saas_organization_quota_usage");
  });
});
