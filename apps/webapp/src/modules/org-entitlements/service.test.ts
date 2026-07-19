import { describe, expect, it, vi } from "vitest";
import type { OrgEntitlementsPort } from "./ports";
import { isMechanicEnabled, resolveClinicSeatLimit, resolveOrgEntitlements } from "./service";
import { MECHANICS } from "./types";

function portFor(
  tariff: { mechanics: Record<string, boolean>; includedSeats?: number | null } | null,
  overrides: { mechanic: string; enabled: boolean; seatLimitOverride?: number | null }[],
): OrgEntitlementsPort {
  return {
    getTariffForOrg: vi.fn(async () =>
      tariff ? { mechanics: tariff.mechanics, includedSeats: tariff.includedSeats ?? null } : null,
    ),
    listOverrides: vi.fn(async () =>
      overrides.map((override) => ({ ...override, seatLimitOverride: override.seatLimitOverride ?? null })),
    ),
  };
}

describe("resolveOrgEntitlements", () => {
  it("defaults every mechanic to enabled when there is no tariff and no overrides", async () => {
    const result = await resolveOrgEntitlements(portFor(null, []), "legacy-org");
    for (const mechanic of MECHANICS) expect(result[mechanic]).toBe(true);
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

  it("keeps intentionally-unassigned existing organizations default-on until a data gate", async () => {
    const result = await resolveOrgEntitlements(portFor(null, []), "legacy-org");
    expect(result.courses).toBe(true);
  });

  it("does not leak an override from organization A into organization B", async () => {
    const ports = new Map<string, OrgEntitlementsPort>([
      ["org-a", portFor(null, [{ mechanic: "courses", enabled: false }])],
      ["org-b", portFor(null, [])],
    ]);
    const scopedPort: OrgEntitlementsPort = {
      getTariffForOrg: (organizationId) => ports.get(organizationId)!.getTariffForOrg(organizationId),
      listOverrides: (organizationId) => ports.get(organizationId)!.listOverrides(organizationId),
    };
    await expect(isMechanicEnabled(scopedPort, "org-a", "courses")).resolves.toBe(false);
    await expect(isMechanicEnabled(scopedPort, "org-b", "courses")).resolves.toBe(true);
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
  it("returns null (unlimited) when there is no tariff and no override", async () => {
    await expect(resolveClinicSeatLimit(portFor(null, []), "org-a")).resolves.toBeNull();
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

  it("does not leak an override from organization A into organization B", async () => {
    const ports = new Map<string, OrgEntitlementsPort>([
      ["org-a", portFor(null, [{ mechanic: "clinic_team", enabled: true, seatLimitOverride: 5 }])],
      ["org-b", portFor(null, [])],
    ]);
    const scopedPort: OrgEntitlementsPort = {
      getTariffForOrg: (organizationId) => ports.get(organizationId)!.getTariffForOrg(organizationId),
      listOverrides: (organizationId) => ports.get(organizationId)!.listOverrides(organizationId),
    };
    await expect(resolveClinicSeatLimit(scopedPort, "org-a")).resolves.toBe(5);
    await expect(resolveClinicSeatLimit(scopedPort, "org-b")).resolves.toBeNull();
  });
});
