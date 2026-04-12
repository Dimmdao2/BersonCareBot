import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const getConfigBoolMock = vi.fn();
const callMergeMock = vi.fn();
const poolQueryMock = vi.fn();
const poolReleaseMock = vi.fn();
const poolConnectMock = vi.fn();
const writeAuditLogMock = vi.fn();
const loggerErrorMock = vi.fn();

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

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: (...a: unknown[]) => getSessionMock(...a),
}));
vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigBool: (...a: unknown[]) => getConfigBoolMock(...a),
}));
vi.mock("@/infra/integrations/integratorUserMergeM2mClient", () => ({
  callIntegratorUserMerge: (...a: unknown[]) => callMergeMock(...a),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({
    connect: (...a: unknown[]) => poolConnectMock(...a),
  }),
}));

import { POST } from "./route";

const adminOk = {
  ok: true as const,
  session: {
    user: { userId: "a1", role: "admin" as const, displayName: "Admin", bindings: {} },
    adminMode: true,
    issuedAt: 0,
    expiresAt: 9_999_999_999,
  },
};

const T = "00000000-0000-4000-8000-000000000011";
const D = "00000000-0000-4000-8000-000000000022";

const twoClientsRows = [
  { id: T, role: "client", merged_into_id: null, integrator_user_id: "100" },
  { id: D, role: "client", merged_into_id: null, integrator_user_id: "200" },
];

describe("POST /api/doctor/clients/integrator-merge (Stage 5)", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getConfigBoolMock.mockReset();
    callMergeMock.mockReset();
    poolQueryMock.mockReset();
    poolReleaseMock.mockReset();
    poolConnectMock.mockReset();
    writeAuditLogMock.mockReset();
    loggerErrorMock.mockReset();
    writeAuditLogMock.mockResolvedValue(undefined);
    getSessionMock.mockResolvedValue(adminOk);
    getConfigBoolMock.mockResolvedValue(true);
    poolConnectMock.mockResolvedValue({
      query: (...a: unknown[]) => poolQueryMock(...a),
      release: (...a: unknown[]) => poolReleaseMock(...a),
    });
  });

  it("returns 400 when v2 flag disabled", async () => {
    getConfigBoolMock.mockResolvedValue(false);
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/integrator-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: T, duplicateId: D }),
      }),
    );
    expect(res.status).toBe(400);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("returns 200 and forwards winner/loser to integrator M2M", async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: twoClientsRows })
      .mockResolvedValueOnce({ rows: [] });
    callMergeMock.mockResolvedValue({ ok: true, result: { ok: true } });
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/integrator-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: T, duplicateId: D }),
      }),
    );
    expect(res.status).toBe(200);
    expect(callMergeMock).toHaveBeenCalledWith({
      winnerIntegratorUserId: "100",
      loserIntegratorUserId: "200",
      dryRun: false,
    });
    expect(poolQueryMock).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(String(poolQueryMock.mock.calls[1]?.[0])).toContain("FOR UPDATE");
    expect(poolQueryMock).toHaveBeenNthCalledWith(3, "COMMIT");
    expect(poolReleaseMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it("returns 403 when admin gate fails", async () => {
    getSessionMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false }, { status: 403 }),
    });
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/integrator-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: T, duplicateId: D }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 503 when integrator M2M times out", async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: twoClientsRows })
      .mockResolvedValueOnce({ rows: [] });
    callMergeMock.mockResolvedValue({ ok: false, reason: "timeout" });

    const res = await POST(
      new Request("http://localhost/api/doctor/clients/integrator-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: T, duplicateId: D }),
      }),
    );

    expect(res.status).toBe(503);
    expect(poolQueryMock).toHaveBeenNthCalledWith(3, "ROLLBACK");
    expect(poolReleaseMock).toHaveBeenCalledTimes(1);
    expect(loggerErrorMock).toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: "a1",
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
    poolQueryMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s === "BEGIN") return { rows: [], rowCount: null };
      if (s.includes("FROM platform_users") && s.includes("FOR UPDATE")) return { rows: twoClientsRows, rowCount: 2 };
      if (s.includes("UPDATE platform_users") && s.includes("integrator_user_id = NULL"))
        return { rows: [], rowCount: 1 };
      if (s === "COMMIT") return { rows: [], rowCount: null };
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
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/integrator-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: T, duplicateId: D }),
      }),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok?: boolean; orphanIntegratorIdCleared?: boolean };
    expect(j.ok).toBe(true);
    expect(j.orphanIntegratorIdCleared).toBe(true);
    const updateCall = poolQueryMock.mock.calls.find((c) => String(c[0]).includes("UPDATE platform_users"));
    expect(updateCall?.[0]).toContain("integrator_user_id = NULL");
    expect(updateCall?.[1]).toEqual([D, "200"]);
    expect(poolQueryMock.mock.calls.some((c) => c[0] === "COMMIT")).toBe(true);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "ok",
        details: expect.objectContaining({ phase: "orphan_duplicate_integrator_id_cleared" }),
      }),
    );
  });

  it("dry-run returns hint when loser integrator id is missing in integrator", async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: twoClientsRows })
      .mockResolvedValueOnce({ rows: [] });
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
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/integrator-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: T, duplicateId: D, dryRun: true }),
      }),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok?: boolean; dryRun?: boolean; duplicateIntegratorUserMissingInIntegrator?: boolean };
    expect(j.ok).toBe(true);
    expect(j.dryRun).toBe(true);
    expect(j.duplicateIntegratorUserMissingInIntegrator).toBe(true);
    expect(poolQueryMock).toHaveBeenNthCalledWith(3, "ROLLBACK");
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
