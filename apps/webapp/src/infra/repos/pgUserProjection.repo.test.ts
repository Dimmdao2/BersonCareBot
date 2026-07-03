import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const { mockGetPool, mockTrustedAnchor, runWebappPgTextMock, mockPhoneHistory } = vi.hoisted(() => ({
  mockGetPool: vi.fn(),
  mockTrustedAnchor: vi.fn(),
  runWebappPgTextMock: vi.fn(),
  mockPhoneHistory: vi.fn(),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: mockGetPool,
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlFromPgClient: (client: unknown) => client,
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

vi.mock("@/infra/repos/pgPlatformUserMerge", () => ({
  mergePlatformUsersInTransaction: vi.fn(),
  pickMergeTargetId: vi.fn(),
  enrichPickMergeCandidatesWithBookingCounts: vi.fn(),
}));

vi.mock("@/modules/platform-access/trustedPhonePolicy", () => ({
  TrustedPatientPhoneSource: {
    IntegratorUpsertFromProjection: "integrator_upsert",
    IntegratorUpdatePhone: "integrator_update_phone",
  },
  trustedPatientPhoneWriteAnchor: mockTrustedAnchor,
}));

vi.mock("@/infra/repos/pgPhoneHistory", () => ({
  applyPlatformUserPhoneHistoryTransition: (...args: unknown[]) => mockPhoneHistory(...args),
}));

import { pgUserProjectionPort } from "./pgUserProjection";

function installPoolClient() {
  const transportQueries: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      transportQueries.push(sql);
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;
  mockGetPool.mockReturnValue({
    connect: vi.fn(async () => client),
  });
  return { client, transportQueries };
}

describe("pgUserProjectionPort (repo SQL parity)", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    mockGetPool.mockReset();
    mockTrustedAnchor.mockReset();
    mockPhoneHistory.mockReset();
    mockPhoneHistory.mockResolvedValue(undefined);
  });

  it("findByIntegratorId filters merged_into_id IS NULL", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ id: "pu-1", phone_normalized: "+79990000001" }],
    });
    const row = await pgUserProjectionPort.findByIntegratorId("42");
    expect(row).toEqual({ platformUserId: "pu-1", phoneNormalized: "+79990000001" });
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("merged_into_id IS NULL");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["42"]);
  });

  it("findByPhoneNormalized uses LIMIT 1 and canonical filter", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: "pu-2" }] });
    const row = await pgUserProjectionPort.findByPhoneNormalized("+79990000002");
    expect(row).toEqual({ platformUserId: "pu-2" });
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("phone_normalized = $1");
    expect(sql).toContain("LIMIT 1");
  });

  it("updateProfileByPhone only updates whitelisted columns", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await pgUserProjectionPort.updateProfileByPhone({
      phoneNormalized: "+79990000003",
      firstName: "A",
      email: "a@test.com",
    });
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("first_name = $1");
    expect(sql).toContain("email = $2");
    expect(sql).not.toContain("role =");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["A", "a@test.com", "+79990000003"]);
  });

  it("updateRole throws when rowCount is zero", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(pgUserProjectionPort.updateRole("missing", "client")).rejects.toThrow(/not found/);
  });

  it("upsertFromProjection insert path uses TX + INSERT when no candidates", async () => {
    const { client, transportQueries } = installPoolClient();
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "pu-new" }] });

    const result = await pgUserProjectionPort.upsertFromProjection({ integratorUserId: "99" });

    expect(result).toEqual({ platformUserId: "pu-new" });
    expect(transportQueries[0]).toBe("BEGIN");
    expect(transportQueries.some((q) => q.includes("SET CONSTRAINTS"))).toBe(true);
    expect(transportQueries).toContain("COMMIT");
    expect(client.release).toHaveBeenCalled();
    const insertSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "");
    expect(insertSql).toContain("INSERT INTO platform_users");
    expect(runWebappPgTextMock.mock.calls[1]?.[2]).toBe(client);
  });

  it("upsertFromProjection update path does not blindly overwrite display_name with weak displayName", async () => {
    installPoolClient();
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ id: "pu-existing" }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await pgUserProjectionPort.upsertFromProjection({
      integratorUserId: "99",
      displayName: "Telegram Name",
    });

    expect(result).toEqual({ platformUserId: "pu-existing" });
    const updateSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "");
    expect(updateSql).toContain("WHEN (display_name IS NULL OR trim(display_name) = '')");
    expect(updateSql).toContain("AND $3::text IS NOT NULL");
    expect(updateSql).toContain("AND $4::text IS NOT NULL");
  });

  it("updatePhone runs UPDATE in TX and applies phone history transition", async () => {
    const { client, transportQueries } = installPoolClient();
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await pgUserProjectionPort.updatePhone("pu-1", "+79990000004");

    expect(transportQueries[0]).toBe("BEGIN");
    expect(transportQueries).toContain("COMMIT");
    expect(client.release).toHaveBeenCalled();
    const updateSql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(updateSql).toContain("phone_normalized = $1");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["+79990000004", "pu-1"]);
    expect(mockPhoneHistory).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        platformUserId: "pu-1",
        newPhoneNormalized: "+79990000004",
        source: "projection",
      }),
    );
    expect(mockTrustedAnchor).toHaveBeenCalledWith("integrator_update_phone");
  });
});
