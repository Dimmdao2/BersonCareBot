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

import { createPgCommentsPort } from "./pgComments";

const orgA = "10000000-0000-4000-8000-000000000001";
const orgB = "20000000-0000-4000-8000-000000000002";
const commentId = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-0000000000b1";
const authorId = "00000000-0000-4000-8000-0000000000a1";

const dbRow = {
  id: commentId,
  organizationId: orgA,
  authorId,
  targetType: "program_instance",
  targetId,
  commentType: "clinical_note",
  body: "Note",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
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

describe("pgComments", () => {
  beforeEach(() => {
    getDrizzleMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReset();
    runDrizzleMutationTransactionMock.mockReset();
  });

  it("listByTarget filters by current organization principal", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(orgA);
    const whereMock = vi.fn((condition: unknown) => ({
      orderBy: vi.fn().mockResolvedValue([dbRow]),
      condition,
    }));
    getDrizzleMock.mockReturnValue({
      select: () => ({
        from: () => ({
          where: whereMock,
        }),
      }),
    });

    const list = await createPgCommentsPort().listByTarget("program_instance", targetId);

    expect(list).toEqual([{ ...dbRow, targetType: "program_instance", commentType: "clinical_note" }]);
    const condition = whereMock.mock.calls[0]?.[0];
    expect(isAndCondition(condition)).toBe(true);
    if (isAndCondition(condition)) {
      expect(condition.conditions.map((c) => c.value)).toContain(orgA);
    }
  });

  it("create stamps current organization principal in the mutation transaction", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(orgA);
    const valuesMock = vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([dbRow]),
    }));
    runDrizzleMutationTransactionMock.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({
        insert: () => ({
          values: valuesMock,
        }),
      }),
    );

    const row = await createPgCommentsPort().create(
      {
        targetType: "program_instance",
        targetId,
        commentType: "clinical_note",
        body: "Note",
      },
      authorId,
    );

    expect(row.organizationId).toBe(orgA);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgA,
        authorId,
        targetType: "program_instance",
        targetId,
      }),
    );
  });

  it("update rejects existing comments from another organization principal before mutation", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(orgA);
    getDrizzleMock.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([{ ...dbRow, organizationId: orgB }]),
          }),
        }),
      }),
    });

    await expect(createPgCommentsPort().update(commentId, { body: "Changed" })).rejects.toThrow(
      "organization_principal_mismatch",
    );
    expect(runDrizzleMutationTransactionMock).not.toHaveBeenCalled();
  });

  it("delete rejects existing comments from another organization principal before mutation", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(orgA);
    getDrizzleMock.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([{ ...dbRow, organizationId: orgB }]),
          }),
        }),
      }),
    });

    await expect(createPgCommentsPort().delete(commentId)).rejects.toThrow("organization_principal_mismatch");
    expect(runDrizzleMutationTransactionMock).not.toHaveBeenCalled();
  });
});
