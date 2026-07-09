import { beforeEach, describe, expect, it, vi } from "vitest";

const getDrizzleMock = vi.hoisted(() => vi.fn());
const getCurrentDbPrincipalOrganizationIdMock = vi.hoisted(() => vi.fn<() => string | undefined>());
const runWithDbOrganizationPrincipalMock = vi.hoisted(() => vi.fn());
const withTransactionMock = vi.hoisted(() => vi.fn());
const getWebappSqlFromPgClientMock = vi.hoisted(() => vi.fn());

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: (...conditions: unknown[]) => ({ kind: "and", conditions }),
    desc: (column: unknown) => ({ kind: "desc", column }),
    eq: (column: unknown, value: unknown) => ({ kind: "eq", column, value }),
  };
});

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: getDrizzleMock,
}));

vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipalOrganizationId: getCurrentDbPrincipalOrganizationIdMock,
  runWithDbOrganizationPrincipal: (organizationId: string, fn: () => unknown) =>
    runWithDbOrganizationPrincipalMock(organizationId, fn),
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlFromPgClient: getWebappSqlFromPgClientMock,
}));

vi.mock("@/infra/db/withClient", () => ({
  withTransaction: (fn: (client: unknown) => unknown) => withTransactionMock(fn),
}));

import { createPgPatientPaymentsPort } from "./pgPatientPayments";

const ORG_ID = "10000000-0000-4000-8000-000000000001";
const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const DOCTOR_ID = "00000000-0000-4000-8000-00000000000d";

const paymentRow = {
  id: "payment-1",
  organizationId: ORG_ID,
  patientUserId: PATIENT_ID,
  amountMinor: 1000,
  currency: "RUB",
  kind: "cash",
  status: "paid",
  comment: null,
  service: null,
  visitId: null,
  provider: null,
  providerPaymentId: null,
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

describe("pgPatientPayments principal scoping", () => {
  beforeEach(() => {
    getDrizzleMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReset();
    runWithDbOrganizationPrincipalMock.mockReset();
    withTransactionMock.mockReset();
    getWebappSqlFromPgClientMock.mockReset();
  });

  it("listPayments requires an organization principal", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(undefined);

    await expect(createPgPatientPaymentsPort().listPayments(PATIENT_ID)).rejects.toThrow(
      "organization_principal_required",
    );
    expect(getDrizzleMock).not.toHaveBeenCalled();
  });

  it("listPayments filters by current organization principal", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_ID);
    const capturedConditions: unknown[] = [];
    const whereMock = vi.fn((condition: unknown) => {
      capturedConditions.push(condition);
      return { orderBy: vi.fn().mockResolvedValue([paymentRow]) };
    });
    getDrizzleMock.mockReturnValue({
      select: () => ({
        from: () => ({
          where: whereMock,
        }),
      }),
    });

    const rows = await createPgPatientPaymentsPort().listPayments(PATIENT_ID);

    expect(rows).toHaveLength(1);
    const condition = capturedConditions[0];
    expect(isAndCondition(condition)).toBe(true);
    if (isAndCondition(condition)) {
      expect(condition.conditions.map((c) => c.value)).toEqual(expect.arrayContaining([PATIENT_ID, ORG_ID]));
    }
  });

  it("addCashPayment runs under the input organization principal and stamps organization_id", async () => {
    const valuesMock = vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([paymentRow]),
    }));
    const tx = {
      insert: () => ({
        values: valuesMock,
      }),
    };
    runWithDbOrganizationPrincipalMock.mockImplementation((_: string, fn: () => unknown) => fn());
    withTransactionMock.mockImplementation((fn: (client: unknown) => unknown) => fn({}));
    getWebappSqlFromPgClientMock.mockReturnValue(tx);

    const row = await createPgPatientPaymentsPort().addCashPayment({
      organizationId: ORG_ID,
      patientUserId: PATIENT_ID,
      amountMinor: 1000,
      createdBy: DOCTOR_ID,
    });

    expect(row.id).toBe("payment-1");
    expect(runWithDbOrganizationPrincipalMock).toHaveBeenCalledWith(ORG_ID, expect.any(Function));
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        patientUserId: PATIENT_ID,
        amountMinor: 1000,
        kind: "cash",
        status: "paid",
      }),
    );
  });

  it("updatePatientPaymentStatus binds the update predicate to the organization", async () => {
    const capturedConditions: unknown[] = [];
    const whereMock = vi.fn((condition: unknown) => {
      capturedConditions.push(condition);
      return undefined;
    });
    const tx = {
      update: () => ({
        set: () => ({
          where: whereMock,
        }),
      }),
    };
    runWithDbOrganizationPrincipalMock.mockImplementation((_: string, fn: () => unknown) => fn());
    withTransactionMock.mockImplementation((fn: (client: unknown) => unknown) => fn({}));
    getWebappSqlFromPgClientMock.mockReturnValue(tx);

    await createPgPatientPaymentsPort().updatePatientPaymentStatus("payment-1", "paid", ORG_ID);

    const condition = capturedConditions[0];
    expect(isAndCondition(condition)).toBe(true);
    if (isAndCondition(condition)) {
      expect(condition.conditions.map((c) => c.value)).toEqual(expect.arrayContaining(["payment-1", ORG_ID]));
    }
  });
});
