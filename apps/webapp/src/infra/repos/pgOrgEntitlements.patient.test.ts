/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentWebappDbOperationFamily } from "@/infra/db/saasIsolationOperationContext";

type TestPrincipal =
  | { kind: "patient"; organizationId?: string; platformUserId: string }
  | { kind: "staff"; organizationId: string; platformUserId: string }
  | undefined;

const getCurrentDbPrincipalMock = vi.hoisted(() => vi.fn<() => TestPrincipal>());
const getDrizzleMock = vi.hoisted(() => vi.fn());
const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipal: getCurrentDbPrincipalMock,
}));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: getDrizzleMock,
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import { createPgOrgEntitlementsPort } from "./pgOrgEntitlements";

const ORGANIZATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOREIGN_ORGANIZATION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PATIENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const patientRows = [
  {
    tariff_mechanics: { courses: false, clinic_team: true },
    included_seats: 3,
    override_mechanic: "courses",
    override_enabled: true,
    seat_limit_override: null,
  },
];

describe("pgOrgEntitlements current-patient capability", () => {
  beforeEach(() => {
    getCurrentDbPrincipalMock.mockReset();
    getDrizzleMock.mockReset();
    runWebappPgTextMock.mockReset();
  });

  it("reads tariff and overrides only through the exact current-patient capability", async () => {
    getCurrentDbPrincipalMock.mockReturnValue({
      kind: "patient",
      organizationId: ORGANIZATION_ID,
      platformUserId: PATIENT_ID,
    });
    runWebappPgTextMock.mockImplementation(async (sql: string) => {
      expect(sql).toBe("SELECT * FROM app.read_current_patient_organization_entitlements()");
      expect(getCurrentWebappDbOperationFamily()).toBe("patient_ui_config");
      return { rows: patientRows };
    });

    const port = createPgOrgEntitlementsPort();
    await expect(port.getTariffForOrg(ORGANIZATION_ID)).resolves.toEqual({
      mechanics: { courses: false, clinic_team: true },
      quotas: {},
      includedSeats: 3,
    });
    await expect(port.listOverrides(ORGANIZATION_ID)).resolves.toEqual([
      { mechanic: "courses", enabled: true, quota: null, expiresAt: null, seatLimitOverride: null },
    ]);

    expect(getDrizzleMock).not.toHaveBeenCalled();
  });

  it("rejects a caller-supplied foreign organization before any SQL", async () => {
    getCurrentDbPrincipalMock.mockReturnValue({
      kind: "patient",
      organizationId: ORGANIZATION_ID,
      platformUserId: PATIENT_ID,
    });

    await expect(
      createPgOrgEntitlementsPort().getTariffForOrg(FOREIGN_ORGANIZATION_ID),
    ).rejects.toThrow("patient_entitlement_organization_mismatch");
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
    expect(getDrizzleMock).not.toHaveBeenCalled();
  });

  it("rejects missing organization context before any SQL", async () => {
    getCurrentDbPrincipalMock.mockReturnValue({ kind: "patient", platformUserId: PATIENT_ID });

    await expect(
      createPgOrgEntitlementsPort().listOverrides(ORGANIZATION_ID),
    ).rejects.toThrow("patient_entitlement_organization_mismatch");
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });

  it("fails closed when the DB capability rejects a revoked or inactive relationship", async () => {
    getCurrentDbPrincipalMock.mockReturnValue({
      kind: "patient",
      organizationId: ORGANIZATION_ID,
      platformUserId: PATIENT_ID,
    });
    runWebappPgTextMock.mockResolvedValue({ rows: [] });

    await expect(
      createPgOrgEntitlementsPort().getTariffForOrg(ORGANIZATION_ID),
    ).rejects.toThrow("patient_entitlement_context_denied");
  });

  it("keeps the existing staff Drizzle path unchanged", async () => {
    getCurrentDbPrincipalMock.mockReturnValue({
      kind: "staff",
      organizationId: ORGANIZATION_ID,
      platformUserId: PATIENT_ID,
    });
    const organizationLimit = vi.fn().mockResolvedValue([{ tariffId: "tariff-1" }]);
    const organizationWhere = vi.fn(() => ({ limit: organizationLimit }));
    const trialLimit = vi.fn().mockResolvedValue([]);
    const trialWhere = vi.fn(() => ({ limit: trialLimit }));
    const tariffLimit = vi.fn().mockResolvedValue([
      { mechanics: { courses: true }, quotas: {}, includedSeats: 2 },
    ]);
    const tariffWhere = vi.fn(() => ({ limit: tariffLimit }));
    const overridesWhere = vi.fn().mockResolvedValue([
      { mechanic: "courses", enabled: false, quota: null, expiresAt: null, seatLimitOverride: null },
    ]);
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: vi.fn(() => ({ where: organizationWhere })) })
      .mockReturnValueOnce({ from: vi.fn(() => ({ where: trialWhere })) })
      .mockReturnValueOnce({ from: vi.fn(() => ({ where: tariffWhere })) })
      .mockReturnValueOnce({ from: vi.fn(() => ({ where: overridesWhere })) });
    getDrizzleMock.mockReturnValue({ select });

    const port = createPgOrgEntitlementsPort();
    await expect(port.getTariffForOrg(ORGANIZATION_ID)).resolves.toEqual({
      mechanics: { courses: true },
      quotas: {},
      includedSeats: 2,
    });
    await expect(port.listOverrides(ORGANIZATION_ID)).resolves.toEqual([
      { mechanic: "courses", enabled: false, quota: null, expiresAt: null, seatLimitOverride: null },
    ]);
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });
});
