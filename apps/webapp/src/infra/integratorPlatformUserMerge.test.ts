/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const clientQueryMock = vi.hoisted(() => vi.fn());
const poolReleaseMock = vi.hoisted(() => vi.fn());
const poolConnectMock = vi.hoisted(() => vi.fn());
const callMergeMock = vi.hoisted(() => vi.fn());
const writeAuditLogMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
  getWebappSqlFromPgClient: (client: unknown) => client,
}));

vi.mock("@/infra/adminAuditLog", () => ({
  writeAuditLog: (...a: unknown[]) => writeAuditLogMock(...a),
}));

vi.mock("@/infra/logging/logger", () => ({
  logger: {
    error: (...a: unknown[]) => loggerErrorMock(...a),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/infra/mergeAuditLabels", () => ({
  fetchMergePartyDisplayLabels: vi.fn().mockResolvedValue({
    targetDisplayName: "Target FIO",
    duplicateDisplayName: "Dup FIO",
  }),
}));

vi.mock("@/infra/integrations/integratorUserMergeM2mClient", () => ({
  callIntegratorUserMerge: (...a: unknown[]) => callMergeMock(...a),
}));

import { executeIntegratorPlatformUserMerge } from "./integratorPlatformUserMerge";

const T = "00000000-0000-4000-8000-000000000011";
const D = "00000000-0000-4000-8000-000000000022";
const ACTOR = "a1";

const twoClientsRows = [
  { id: T, role: "client", merged_into_id: null, integrator_user_id: "100" },
  { id: D, role: "client", merged_into_id: null, integrator_user_id: "200" },
];

const pool = {
  connect: (...a: unknown[]) => poolConnectMock(...a),
} as never;

describe("executeIntegratorPlatformUserMerge", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    clientQueryMock.mockReset();
    poolReleaseMock.mockReset();
    poolConnectMock.mockReset();
    callMergeMock.mockReset();
    writeAuditLogMock.mockReset();
    loggerErrorMock.mockReset();
    writeAuditLogMock.mockResolvedValue(undefined);
    poolConnectMock.mockResolvedValue({
      query: (...a: unknown[]) => clientQueryMock(...a),
      release: (...a: unknown[]) => poolReleaseMock(...a),
    });
    clientQueryMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s === "BEGIN" || s === "COMMIT" || s === "ROLLBACK") {
        return { rows: [], rowCount: null };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  it("returns 200 and forwards winner/loser to integrator M2M", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: twoClientsRows, rowCount: 2 });
    callMergeMock.mockResolvedValue({ ok: true, result: { ok: true } });

    const result = await executeIntegratorPlatformUserMerge({
      pool,
      actorId: ACTOR,
      targetId: T,
      duplicateId: D,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(callMergeMock).toHaveBeenCalledWith({
      winnerIntegratorUserId: "100",
      loserIntegratorUserId: "200",
      dryRun: false,
    });
    expect(clientQueryMock).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("FOR UPDATE");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(poolReleaseMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it("returns 503 when integrator M2M times out", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: twoClientsRows, rowCount: 2 });
    callMergeMock.mockResolvedValue({ ok: false, reason: "timeout" });

    const result = await executeIntegratorPlatformUserMerge({
      pool,
      actorId: ACTOR,
      targetId: T,
      duplicateId: D,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(poolReleaseMock).toHaveBeenCalledTimes(1);
    expect(loggerErrorMock).toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: ACTOR,
        action: "integrator_user_merge",
        targetId: T,
        status: "error",
        details: expect.objectContaining({
          phase: "integrator_timeout",
          targetDisplayName: "Target FIO",
          duplicateDisplayName: "Dup FIO",
        }),
      }),
    );
  });

  it("clears duplicate integrator_user_id when integrator reports USER_NOT_FOUND for loser only", async () => {
    runWebappPgTextMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes("FROM platform_users") && s.includes("FOR UPDATE")) {
        return { rows: twoClientsRows, rowCount: 2 };
      }
      if (s.includes("UPDATE platform_users") && s.includes("integrator_user_id = NULL")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    callMergeMock.mockResolvedValue({
      ok: false,
      reason: "http",
      status: 400,
      bodyText: JSON.stringify({
        ok: false,
        error: "USER_NOT_FOUND",
        message: "winner or loser user row not found",
        missingIntegratorUserIds: ["200"],
      }),
    });

    const result = await executeIntegratorPlatformUserMerge({
      pool,
      actorId: ACTOR,
      targetId: T,
      duplicateId: D,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body.orphanIntegratorIdCleared).toBe(true);
    const updateCall = runWebappPgTextMock.mock.calls.find((c) =>
      String(c[0]).includes("UPDATE platform_users"),
    );
    expect(updateCall?.[0]).toContain("integrator_user_id = NULL");
    expect(updateCall?.[1]).toEqual([D, "200"]);
    expect(clientQueryMock.mock.calls.some((c) => c[0] === "COMMIT")).toBe(true);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "ok",
        details: expect.objectContaining({ phase: "orphan_duplicate_integrator_id_cleared" }),
      }),
    );
  });

  it("dry-run returns hint when loser integrator id is missing in integrator", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: twoClientsRows, rowCount: 2 });
    callMergeMock.mockResolvedValue({
      ok: false,
      reason: "http",
      status: 400,
      bodyText: JSON.stringify({
        ok: false,
        error: "USER_NOT_FOUND",
        missingIntegratorUserIds: ["200"],
      }),
    });

    const result = await executeIntegratorPlatformUserMerge({
      pool,
      actorId: ACTOR,
      targetId: T,
      duplicateId: D,
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    expect(result.body.dryRun).toBe(true);
    expect(result.body.duplicateIntegratorUserMissingInIntegrator).toBe(true);
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns 404 missing_user when fewer than two platform rows", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [twoClientsRows[0]], rowCount: 1 });

    const result = await executeIntegratorPlatformUserMerge({
      pool,
      actorId: ACTOR,
      targetId: T,
      duplicateId: D,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.body.error).toBe("missing_user");
    expect(callMergeMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "error",
        details: expect.objectContaining({ phase: "precheck_missing_user" }),
      }),
    );
  });

  it("returns 400 not_client when role is not client", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        { ...twoClientsRows[0], role: "admin" },
        twoClientsRows[1],
      ],
      rowCount: 2,
    });

    const result = await executeIntegratorPlatformUserMerge({
      pool,
      actorId: ACTOR,
      targetId: T,
      duplicateId: D,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("not_client");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        details: expect.objectContaining({ phase: "precheck_role" }),
      }),
    );
  });

  it("returns 409 alias_not_allowed when merged_into_id is set", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        twoClientsRows[0],
        { ...twoClientsRows[1], merged_into_id: T },
      ],
      rowCount: 2,
    });

    const result = await executeIntegratorPlatformUserMerge({
      pool,
      actorId: ACTOR,
      targetId: T,
      duplicateId: D,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.body.error).toBe("alias_not_allowed");
  });

  it("returns 400 integrator_ids_not_divergent when ids match", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        { ...twoClientsRows[0], integrator_user_id: "100" },
        { ...twoClientsRows[1], integrator_user_id: "100" },
      ],
      rowCount: 2,
    });

    const result = await executeIntegratorPlatformUserMerge({
      pool,
      actorId: ACTOR,
      targetId: T,
      duplicateId: D,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("integrator_ids_not_divergent");
    expect(callMergeMock).not.toHaveBeenCalled();
  });

  it("returns 503 integrator_unconfigured when M2M is not configured", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: twoClientsRows, rowCount: 2 });
    callMergeMock.mockResolvedValue({ ok: false, reason: "unconfigured" });

    const result = await executeIntegratorPlatformUserMerge({
      pool,
      actorId: ACTOR,
      targetId: T,
      duplicateId: D,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(result.body.error).toBe("integrator_unconfigured");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        details: expect.objectContaining({ phase: "integrator_unconfigured" }),
      }),
    );
  });

  it("returns integrator HTTP status with parsed details on generic M2M failure", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: twoClientsRows, rowCount: 2 });
    callMergeMock.mockResolvedValue({
      ok: false,
      reason: "http",
      status: 409,
      bodyText: JSON.stringify({ error: "CONFLICT", message: "already merged" }),
    });

    const result = await executeIntegratorPlatformUserMerge({
      pool,
      actorId: ACTOR,
      targetId: T,
      duplicateId: D,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.body.error).toBe("integrator_merge_failed");
    expect(result.body.details).toEqual({ error: "CONFLICT", message: "already merged" });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        details: expect.objectContaining({ phase: "integrator_m2m", httpStatus: 409 }),
      }),
    );
  });

  it("returns 409 orphan_clear_failed when UPDATE clear affects zero rows", async () => {
    runWebappPgTextMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes("FROM platform_users") && s.includes("FOR UPDATE")) {
        return { rows: twoClientsRows, rowCount: 2 };
      }
      if (s.includes("UPDATE platform_users") && s.includes("integrator_user_id = NULL")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    callMergeMock.mockResolvedValue({
      ok: false,
      reason: "http",
      status: 400,
      bodyText: JSON.stringify({
        error: "USER_NOT_FOUND",
        missingIntegratorUserIds: ["200"],
      }),
    });

    const result = await executeIntegratorPlatformUserMerge({
      pool,
      actorId: ACTOR,
      targetId: T,
      duplicateId: D,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.body.error).toBe("orphan_clear_failed");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        details: expect.objectContaining({ phase: "orphan_clear_race" }),
      }),
    );
  });

  it("rolls back and rethrows on unexpected domain SQL error", async () => {
    runWebappPgTextMock.mockRejectedValueOnce(new Error("db down"));

    await expect(
      executeIntegratorPlatformUserMerge({
        pool,
        actorId: ACTOR,
        targetId: T,
        duplicateId: D,
      }),
    ).rejects.toThrow("db down");

    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(poolReleaseMock).toHaveBeenCalledTimes(1);
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});
