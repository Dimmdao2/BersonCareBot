import { beforeEach, describe, expect, it, vi } from "vitest";

const getDrizzleMock = vi.hoisted(() => vi.fn());
const getCurrentDbPrincipalOrganizationIdMock = vi.hoisted(() => vi.fn<() => string | undefined>());
const runDrizzleMutationTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: (...conditions: unknown[]) => ({ kind: "and", conditions }),
    asc: (column: unknown) => ({ kind: "asc", column }),
    eq: (column: unknown, value: unknown) => ({ kind: "eq", column, value }),
    ilike: (column: unknown, value: unknown) => ({ kind: "ilike", column, value }),
  };
});

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: getDrizzleMock,
}));

vi.mock("@/infra/db/drizzleMutationTx", () => ({
  runDrizzleMutationTransaction: runDrizzleMutationTransactionMock,
}));

vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipalOrganizationId: getCurrentDbPrincipalOrganizationIdMock,
}));

import { createPgPatientClinicalPort } from "./pgPatientClinical";

const ORG_ID = "10000000-0000-4000-8000-000000000001";
const DOCTOR_ID = "00000000-0000-4000-8000-00000000000d";

const diagnosisRow = {
  id: "diag-1",
  organizationId: ORG_ID,
  label: "Тендинопатия",
  note: null,
  createdBy: DOCTOR_ID,
  createdAt: "2026-07-01T00:00:00.000Z",
};

type AndCondition = {
  conditions: Array<{ value?: unknown }>;
};

function isAndCondition(value: unknown): value is AndCondition {
  return (
    typeof value === "object" &&
    value !== null &&
    "conditions" in value &&
    Array.isArray((value as { conditions?: unknown }).conditions)
  );
}

describe("pgPatientClinical diagnosis catalog principal scoping", () => {
  beforeEach(() => {
    getDrizzleMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReset();
    runDrizzleMutationTransactionMock.mockReset();
  });

  it("searchDiagnosisCatalog requires an organization principal", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(undefined);

    await expect(createPgPatientClinicalPort().searchDiagnosisCatalog("тенд")).rejects.toThrow(
      "organization_principal_required",
    );
    expect(getDrizzleMock).not.toHaveBeenCalled();
  });

  it("searchDiagnosisCatalog filters by current organization principal", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_ID);
    const capturedConditions: unknown[] = [];
    const whereMock = vi.fn((condition: unknown) => {
      capturedConditions.push(condition);
      return {
      orderBy: () => ({
        limit: vi.fn().mockResolvedValue([diagnosisRow]),
      }),
      };
    });
    getDrizzleMock.mockReturnValue({
      select: () => ({
        from: () => ({
          where: whereMock,
        }),
      }),
    });

    const rows = await createPgPatientClinicalPort().searchDiagnosisCatalog("тенд");

    expect(rows).toEqual([{ id: "diag-1", label: "Тендинопатия", note: null }]);
    const condition = capturedConditions[0];
    expect(isAndCondition(condition)).toBe(true);
    if (isAndCondition(condition)) {
      expect(condition.conditions.map((c) => c.value)).toEqual(expect.arrayContaining(["%тенд%", ORG_ID]));
    }
  });

  it("createDiagnosisCatalogEntry requires an organization principal", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(undefined);

    await expect(
      createPgPatientClinicalPort().createDiagnosisCatalogEntry({
        label: "Тендинопатия",
        note: null,
        createdBy: DOCTOR_ID,
      }),
    ).rejects.toThrow("organization_principal_required");
    expect(runDrizzleMutationTransactionMock).not.toHaveBeenCalled();
  });

  it("createDiagnosisCatalogEntry stamps the current organization principal", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_ID);
    const valuesMock = vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([diagnosisRow]),
    }));
    runDrizzleMutationTransactionMock.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({
        insert: () => ({
          values: valuesMock,
        }),
      }),
    );

    const row = await createPgPatientClinicalPort().createDiagnosisCatalogEntry({
      label: "Тендинопатия",
      note: null,
      createdBy: DOCTOR_ID,
    });

    expect(row).toEqual({ id: "diag-1", label: "Тендинопатия", note: null });
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        label: "Тендинопатия",
        note: null,
        createdBy: DOCTOR_ID,
      }),
    );
  });
});
