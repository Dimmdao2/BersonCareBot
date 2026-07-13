import { describe, expect, it, vi } from "vitest";
import type { OrgEntitlementsPort } from "./ports";
import { isMechanicEnabled, resolveOrgEntitlements } from "./service";
import { MECHANICS } from "./types";

function portFor(
  tariff: { mechanics: Record<string, boolean> } | null,
  overrides: { mechanic: string; enabled: boolean }[],
): OrgEntitlementsPort {
  return {
    getTariffForOrg: vi.fn(async () => tariff),
    listOverrides: vi.fn(async () => overrides),
  };
}

describe("resolveOrgEntitlements", () => {
  it("defaults every mechanic to enabled when there is no tariff and no overrides", async () => {
    const port = portFor(null, []);

    const result = await resolveOrgEntitlements(port, "org-1");

    for (const mechanic of MECHANICS) {
      expect(result[mechanic]).toBe(true);
    }
  });

  it("a tariff-level false wins over the default-true", async () => {
    const port = portFor({ mechanics: { payments: false } }, []);

    const result = await resolveOrgEntitlements(port, "org-1");

    expect(result.payments).toBe(false);
    expect(result.courses).toBe(true);
  });

  it("an org override wins over the tariff value", async () => {
    const port = portFor(
      { mechanics: { branding: true } },
      [{ mechanic: "branding", enabled: false }],
    );

    const result = await resolveOrgEntitlements(port, "org-1");

    expect(result.branding).toBe(false);
  });

  it("an org override wins over the default-true when the tariff is silent on that mechanic", async () => {
    const port = portFor({ mechanics: {} }, [{ mechanic: "booking", enabled: false }]);

    const result = await resolveOrgEntitlements(port, "org-1");

    expect(result.booking).toBe(false);
  });

  it("matches the SQL-proven fixture: booking=default true, branding=override false, payments=tariff false, courses=default true", async () => {
    const port = portFor(
      { mechanics: { payments: false } },
      [{ mechanic: "branding", enabled: false }],
    );

    const result = await resolveOrgEntitlements(port, "org-1");

    expect(result.booking).toBe(true);
    expect(result.branding).toBe(false);
    expect(result.payments).toBe(false);
    expect(result.courses).toBe(true);
  });
});

describe("isMechanicEnabled", () => {
  it("delegates to resolveOrgEntitlements for a single mechanic", async () => {
    const port = portFor(null, [{ mechanic: "files", enabled: false }]);

    await expect(isMechanicEnabled(port, "org-1", "files")).resolves.toBe(false);
    await expect(isMechanicEnabled(port, "org-1", "cms_pages")).resolves.toBe(true);
  });
});
