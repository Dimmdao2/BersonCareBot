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
  it("defaults compatibility mechanics to enabled but clinic_team and courses to disabled when there is no tariff and no overrides", async () => {
    const result = await resolveOrgEntitlements(portFor(null, []), "legacy-org");
    for (const mechanic of MECHANICS) {
      if (mechanic === "clinic_team" || mechanic === "courses") continue;
      expect(result[mechanic]).toBe(true);
    }
    expect(result.clinic_team).toBe(false);
    expect(result.courses).toBe(false);
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
    };
    await expect(resolveClinicSeatLimit(scopedPort, "org-a")).resolves.toBe(5);
    await expect(resolveClinicSeatLimit(scopedPort, "org-b")).resolves.toBe(0);
  });
});
