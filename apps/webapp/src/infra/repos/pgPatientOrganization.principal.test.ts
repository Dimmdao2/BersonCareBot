import { beforeEach, describe, expect, it, vi } from "vitest";

const getDrizzleMock = vi.hoisted(() => vi.fn());
const getCurrentDbPrincipalOrganizationIdMock = vi.hoisted(() => vi.fn<() => string | undefined>());

vi.mock("@/app-layer/db/drizzle", () => ({ getDrizzle: getDrizzleMock }));
vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipalOrganizationId: getCurrentDbPrincipalOrganizationIdMock,
}));
vi.mock("@/infra/db/saasIsolationOperationContext", () => ({
  runWithWebappDbOperationFamily: (_family: string, fn: () => unknown) => fn(),
}));
vi.mock("@/infra/db/runWebappSql", () => ({ runWebappPgText: vi.fn() }));

import { createPgPatientOrganizationPort } from "./pgPatientOrganization";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const PATIENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("pgPatientOrganization trusted organization enrollment check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails closed before querying when the trusted organization principal differs", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_A);
    await expect(
      createPgPatientOrganizationPort().hasActiveEnrollment(PATIENT_ID, ORG_B),
    ).resolves.toBe(false);
    expect(getDrizzleMock).not.toHaveBeenCalled();
  });

  it("keeps M2M/organization-principal enrollment checks on the exact org query", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_A);
    const limit = vi.fn().mockResolvedValue([{ organizationId: ORG_A }]);
    const where = vi.fn(() => ({ limit }));
    getDrizzleMock.mockReturnValue({
      select: () => ({ from: () => ({ where }) }),
    });

    await expect(
      createPgPatientOrganizationPort().hasActiveEnrollment(PATIENT_ID, ORG_A),
    ).resolves.toBe(true);
    expect(where).toHaveBeenCalledOnce();
    expect(limit).toHaveBeenCalledWith(1);
  });
});
