import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlFromPgClient: (client: unknown) => client,
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

import {
  computeConflictKeyFromCandidateIds,
  listAdminAuditLog,
  resolveAdminAuditConflictById,
  upsertOpenConflictLog,
  writeAuditLog,
} from "./adminAuditLog";

const poolStub = {} as Pool;

function installTxClient() {
  const transportQueries: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      transportQueries.push(sql);
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;
  const pool = {
    connect: vi.fn(async () => client),
  } as unknown as Pool;
  return { pool, client, transportQueries };
}

describe("computeConflictKeyFromCandidateIds", () => {
  it("is stable under reordering and dedupes", () => {
    const a = computeConflictKeyFromCandidateIds([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ]);
    const b = computeConflictKeyFromCandidateIds([
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("throws on empty input", () => {
    expect(() => computeConflictKeyFromCandidateIds([])).toThrow();
  });
});

describe("writeAuditLog", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("inserts via runWebappPgText", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await writeAuditLog(poolStub, { actorId: null, action: "test_action", details: { a: 1 } });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const args = runWebappPgTextMock.mock.calls[0];
    expect(args?.[0]).toContain("INSERT INTO admin_audit_log");
    expect(args?.[1]).toEqual([null, "test_action", null, null, '{"a":1}', "ok"]);
  });

  it("logs and swallows DB errors", async () => {
    const errorSpy = vi.spyOn((await import("./logging/logger")).logger, "error").mockImplementation(() => {});
    runWebappPgTextMock.mockRejectedValueOnce(new Error("db down"));
    await expect(writeAuditLog(poolStub, { actorId: null, action: "test_action" })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("upsertOpenConflictLog", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("writes anomaly log when candidateIds is empty", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const res = await upsertOpenConflictLog(poolStub, {
      actorId: null,
      candidateIds: [],
      targetId: "u1",
      details: { reason: "missing_ids" },
      status: "error",
    });
    expect(res).toEqual({ kind: "anomaly" });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const args = runWebappPgTextMock.mock.calls[0];
    expect(args?.[0]).toContain("INSERT INTO admin_audit_log");
    expect(args?.[1]?.[1]).toBe("auto_merge_conflict_anomaly");
    expect(args?.[1]?.[2]).toBe("u1");
    expect(args?.[1]?.[3]).toBeNull();
  });

  it("merges seenEventTypes from details and eventType", async () => {
    runWebappPgTextMock.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id, details, repeat_count")) {
        return {
          rowCount: 1,
          rows: [{ id: "r1", details: { seenEventTypes: ["contact.linked"] }, repeat_count: 2 }],
        };
      }
      if (sql.includes("UPDATE admin_audit_log")) return { rowCount: 1, rows: [] };
      return { rowCount: 0, rows: [] };
    });
    const { pool, transportQueries } = installTxClient();
    const res = await upsertOpenConflictLog(pool, {
      actorId: null,
      candidateIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      details: {
        eventType: "user.upserted",
        seenEventTypes: ["appointment.record.upserted"],
      },
      status: "error",
    });
    expect(res).toEqual({ kind: "conflict", insertedFirst: false });
    expect(transportQueries[0]).toBe("BEGIN");
    expect(transportQueries).toContain("COMMIT");
    const updateCall = runWebappPgTextMock.mock.calls.find((c) => String(c[0]).includes("UPDATE admin_audit_log"));
    expect(updateCall).toBeDefined();
    const payloadJson = updateCall?.[1]?.[1];
    expect(typeof payloadJson).toBe("string");
    const payload = JSON.parse(String(payloadJson)) as { seenEventTypes: string[] };
    expect(payload.seenEventTypes).toEqual([
      "appointment.record.upserted",
      "contact.linked",
      "user.upserted",
    ]);
  });

  it("handles unique race by updating existing open conflict row", async () => {
    let insertAttempts = 0;
    runWebappPgTextMock.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id, details, repeat_count")) {
        if (insertAttempts === 0) return { rowCount: 0, rows: [] };
        return { rowCount: 1, rows: [{ id: "r2", details: { seenEventTypes: [] }, repeat_count: 1 }] };
      }
      if (sql.includes("INSERT INTO admin_audit_log")) {
        insertAttempts += 1;
        const err = new Error("duplicate key") as Error & { code?: string };
        err.code = "23505";
        throw err;
      }
      if (sql.includes("UPDATE admin_audit_log")) return { rowCount: 1, rows: [] };
      return { rowCount: 0, rows: [] };
    });
    const { pool } = installTxClient();
    const res = await upsertOpenConflictLog(pool, {
      actorId: null,
      candidateIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      details: { eventType: "contact.linked" },
      status: "error",
    });
    expect(res).toEqual({ kind: "conflict", insertedFirst: false });
    expect(runWebappPgTextMock.mock.calls.some((c) => String(c[0]).includes("UPDATE admin_audit_log"))).toBe(true);
  });

  it("returns insertedFirst on new open conflict row", async () => {
    runWebappPgTextMock.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id, details, repeat_count")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("INSERT INTO admin_audit_log")) return { rowCount: 1, rows: [] };
      return { rowCount: 0, rows: [] };
    });
    const { pool } = installTxClient();
    const res = await upsertOpenConflictLog(pool, {
      actorId: null,
      candidateIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      details: { eventType: "contact.linked" },
      status: "error",
    });
    expect(res).toEqual({ kind: "conflict", insertedFirst: true });
  });

  it("insert uses custom action and conflictKey when provided", async () => {
    runWebappPgTextMock.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id, details, repeat_count")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("INSERT INTO admin_audit_log")) return { rowCount: 1, rows: [] };
      return { rowCount: 0, rows: [] };
    });
    const { pool } = installTxClient();
    await upsertOpenConflictLog(pool, {
      actorId: null,
      action: "channel_link_ownership_conflict",
      conflictKey: "custom-ownership-key",
      candidateIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      targetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      details: { source: "channel_link", classifiedReason: "channel_owned_by_real_user" },
      status: "error",
    });
    const insertCall = runWebappPgTextMock.mock.calls.find((c) => String(c[0]).includes("INSERT INTO admin_audit_log"));
    expect(insertCall).toBeDefined();
    const params = insertCall?.[1] as unknown[];
    expect(params?.[1]).toBe("channel_link_ownership_conflict");
    expect(params?.[3]).toBe("custom-ownership-key");
  });

  it("rolls back TX and returns skipped when domain SQL fails", async () => {
    const errorSpy = vi.spyOn((await import("./logging/logger")).logger, "error").mockImplementation(() => {});
    runWebappPgTextMock.mockRejectedValueOnce(new Error("select failed"));
    const { pool, transportQueries } = installTxClient();
    const res = await upsertOpenConflictLog(pool, {
      actorId: null,
      candidateIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      details: { eventType: "contact.linked" },
    });
    expect(res).toEqual({ kind: "skipped" });
    expect(transportQueries[0]).toBe("BEGIN");
    expect(transportQueries).toContain("ROLLBACK");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("swallows connect failure and logs error", async () => {
    const errorSpy = vi.spyOn((await import("./logging/logger")).logger, "error").mockImplementation(() => {});
    const pool = {
      connect: vi.fn().mockRejectedValue(new Error("connect failed")),
    } as unknown as Pool;
    await expect(
      upsertOpenConflictLog(pool, {
        actorId: null,
        candidateIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
        details: { eventType: "contact.linked" },
      }),
    ).resolves.toEqual({ kind: "skipped" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("listAdminAuditLog", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("excludeActionPrefix adds NOT LIKE filter", async () => {
    runWebappPgTextMock.mockImplementation(async (sql: string) => {
      if (sql.includes("count(*)")) {
        return { rows: [{ n: "0" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    await listAdminAuditLog(poolStub, { page: 1, limit: 10, excludeActionPrefix: "system_health_" });

    const countCall = runWebappPgTextMock.mock.calls.find((c) => String(c[0]).includes("count(*)"));
    expect(String(countCall?.[0])).toContain("NOT LIKE");
    expect(countCall?.[1]).toEqual(expect.arrayContaining(["system_health_"]));
  });

  it("involvesPlatformUserId SQL matches merge/bind candidateIds and user_merge details", async () => {
    const uid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    runWebappPgTextMock.mockImplementation(async (sql: string) => {
      if (sql.includes("count(*)")) {
        return { rows: [{ n: "0" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    await listAdminAuditLog(poolStub, { page: 1, limit: 10, involvesPlatformUserId: uid });

    const countCall = runWebappPgTextMock.mock.calls.find((c) => String(c[0]).includes("count(*)"));
    expect(countCall).toBeDefined();
    const countSql = String(countCall?.[0]);
    expect(countSql).toContain("auto_merge_conflict");
    expect(countSql).toContain("messenger_phone_bind_blocked");
    expect(countSql).toContain("messenger_phone_bind_anomaly");
    expect(countSql).toContain("channel_link_ownership_conflict");
    expect(countSql).toContain("candidateIds");
    expect(countSql).toContain("user_merge");
    expect(countSql).toContain("integrator_user_merge");
    expect(countSql).toContain("details->>'targetId'");
    expect(countSql).toContain("details->>'duplicateId'");
    expect(countSql).toContain(`l.target_id = $1`);
  });

  it("list query joins platform_users for actor_display_name", async () => {
    runWebappPgTextMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("count(*)")) {
        return { rows: [{ n: "1" }], rowCount: 1 };
      }
      return {
        rows: [
          {
            id: "log-1",
            actor_id: "actor-1",
            action: "user_merge",
            target_id: null,
            conflict_key: null,
            details: {},
            status: "ok",
            repeat_count: 1,
            last_seen_at: "2026-01-01",
            resolved_at: null,
            created_at: "2026-01-01",
            actor_display_name: "Dr A",
          },
        ],
        rowCount: 1,
      };
    });

    const page = await listAdminAuditLog(poolStub, { page: 1, limit: 10, action: "user_merge" });

    const listCall = runWebappPgTextMock.mock.calls.find(
      (c) => String(c[0]).includes("LEFT JOIN platform_users"),
    );
    expect(listCall).toBeDefined();
    expect(String(listCall?.[0])).toContain("ORDER BY l.created_at DESC");
    expect(listCall?.[1]).toEqual(expect.arrayContaining(["user_merge", 10, 0]));
    expect(page.items[0]?.actor_display_name).toBe("Dr A");
    expect(page.total).toBe(1);
  });
});

describe("resolveAdminAuditConflictById", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  const id = "6ef47437-fbed-4d47-a3d4-de6a4ea609cb";

  it("returns not_found when row missing", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const r = await resolveAdminAuditConflictById(poolStub, id);
    expect(r).toEqual({ ok: false, error: "not_found" });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
  });

  it("returns not_closeable for arbitrary action", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ action: "settings_change", resolved_at: null }],
      rowCount: 1,
    });
    const r = await resolveAdminAuditConflictById(poolStub, id);
    expect(r).toEqual({ ok: false, error: "not_closeable" });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
  });

  it("returns already_resolved when resolved_at set", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ action: "auto_merge_conflict", resolved_at: "2026-01-01" }],
      rowCount: 1,
    });
    const r = await resolveAdminAuditConflictById(poolStub, id);
    expect(r).toEqual({ ok: false, error: "already_resolved" });
  });

  it("updates when open auto_merge_conflict", async () => {
    runWebappPgTextMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (String(sql).includes("SELECT action")) {
        return { rows: [{ action: "auto_merge_conflict", resolved_at: null }], rowCount: 1 };
      }
      if (String(sql).includes("UPDATE admin_audit_log")) {
        expect(params?.[0]).toBe(id);
        return { rows: [{ id }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await resolveAdminAuditConflictById(poolStub, id);
    expect(r).toEqual({ ok: true, updated: true });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
  });

  it("returns already_resolved when update rowCount is missing", async () => {
    runWebappPgTextMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT action")) {
        return { rows: [{ action: "auto_merge_conflict", resolved_at: null }], rowCount: 1 };
      }
      if (String(sql).includes("UPDATE admin_audit_log")) {
        return { rows: [], rowCount: undefined };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await resolveAdminAuditConflictById(poolStub, id);
    expect(r).toEqual({ ok: false, error: "already_resolved" });
  });
});
