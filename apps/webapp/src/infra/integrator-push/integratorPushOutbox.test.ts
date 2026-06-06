/** Wave 3 phase 15D — integrator push outbox Drizzle contract tests. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getWebappSqlDbMock, getWebappSqlFromPgClientMock, runWebappSqlMock } = vi.hoisted(() => ({
  getWebappSqlDbMock: vi.fn(),
  getWebappSqlFromPgClientMock: vi.fn(),
  runWebappSqlMock: vi.fn(),
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlDb: () => getWebappSqlDbMock(),
  getWebappSqlFromPgClient: (client: unknown) => getWebappSqlFromPgClientMock(client),
  runWebappSql: (...args: unknown[]) => runWebappSqlMock(...args),
}));

import {
  claimDueIntegratorPushJobs,
  completeIntegratorPushJob,
  enqueueIntegratorPush,
  failIntegratorPushJobDead,
  isRecoverableIntegratorPushFailure,
  rescheduleIntegratorPushJob,
} from "./integratorPushOutbox";

const __dirname = dirname(fileURLToPath(import.meta.url));

function drizzleSqlNodeToText(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") return String(node);
  if (typeof node !== "object") return "";
  const rec = node as Record<string, unknown>;
  if (Array.isArray(rec.queryChunks)) {
    return rec.queryChunks.map(drizzleSqlNodeToText).join("");
  }
  if (Array.isArray(rec.value)) {
    return rec.value.map(drizzleSqlNodeToText).join("");
  }
  return "";
}

describe("Wave3 phase 15D integratorPushOutbox (runtime constraints)", () => {
  it("uses Drizzle — no db.query in integratorPushOutbox.ts", () => {
    const src = readFileSync(join(__dirname, "integratorPushOutbox.ts"), "utf8");
    expect(src).not.toMatch(/\bdb\.query\b/);
    expect(src).toContain("integratorPushOutbox");
    expect(src).toMatch(/Wave 3 phase 15D/);
  });
});

describe("isRecoverableIntegratorPushFailure", () => {
  it("treats 5xx and network-style messages as recoverable", () => {
    expect(isRecoverableIntegratorPushFailure(new Error("integrator settings/sync 503: x"))).toBe(true);
    expect(isRecoverableIntegratorPushFailure(new Error("integrator_m2m_unconfigured"))).toBe(true);
    expect(isRecoverableIntegratorPushFailure(new Error("fetch failed"))).toBe(true);
  });

  it("treats 4xx (except 408/429) as non-recoverable", () => {
    expect(isRecoverableIntegratorPushFailure(new Error("integrator reminders/rules 400: bad"))).toBe(false);
    expect(isRecoverableIntegratorPushFailure(new Error("integrator reminders/rules 408: timeout"))).toBe(true);
    expect(isRecoverableIntegratorPushFailure(new Error("integrator reminders/rules 429: rate"))).toBe(true);
  });
});

describe("integratorPushOutbox Drizzle producer/consumer contract", () => {
  let drizzleDb: {
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    runWebappSqlMock.mockReset();
    getWebappSqlDbMock.mockReset();
    getWebappSqlFromPgClientMock.mockReset();
    drizzleDb = {
      insert: vi.fn(),
      update: vi.fn(),
    };
    getWebappSqlDbMock.mockReturnValue(drizzleDb);
    getWebappSqlFromPgClientMock.mockReturnValue(drizzleDb);
  });

  it("enqueueIntegratorPush upserts via Drizzle onConflictDoUpdate", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    drizzleDb.insert.mockReturnValue({ values });
    const pool = { connect: vi.fn() } as unknown as import("pg").Pool;

    await enqueueIntegratorPush(pool, {
      kind: "system_settings_sync",
      idempotencyKey: "settings:admin:dev_mode",
      payload: { key: "dev_mode", scope: "admin" },
    });

    expect(getWebappSqlDbMock).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "system_settings_sync",
        idempotencyKey: "settings:admin:dev_mode",
        status: "pending",
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          status: "pending",
          attemptsDone: 0,
          lastError: null,
        }),
      }),
    );
  });

  it("claimDueIntegratorPushJobs uses SKIP LOCKED claim SQL and Zod-maps rows", async () => {
    runWebappSqlMock.mockResolvedValueOnce({
      rows: [
        {
          id: "42",
          kind: "reminder_rule_upsert",
          idempotency_key: "reminder_rule:abc",
          payload: { id: "abc" },
          attempts_done: 1,
          max_attempts: 8,
        },
        {
          id: "43",
          kind: "unknown_kind",
          idempotency_key: "x",
          payload: {},
          attempts_done: 0,
          max_attempts: 8,
        },
      ],
    });
    const pool = { connect: vi.fn() } as unknown as import("pg").Pool;
    const rows = await claimDueIntegratorPushJobs(pool, 5);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "42",
      kind: "reminder_rule_upsert",
      idempotencyKey: "reminder_rule:abc",
      attemptsDone: 1,
      maxAttempts: 8,
    });
    expect(runWebappSqlMock).toHaveBeenCalledTimes(1);
    const sqlArg = runWebappSqlMock.mock.calls[0]?.[1];
    const sqlText = drizzleSqlNodeToText(sqlArg);
    expect(sqlText).toContain("FOR UPDATE SKIP LOCKED");
    expect(sqlText).toContain("integrator_push_outbox");
  });

  it("claimDueIntegratorPushJobs drops rows that fail Zod parse", async () => {
    runWebappSqlMock.mockResolvedValueOnce({
      rows: [
        {
          id: "44",
          kind: "system_settings_sync",
          payload: ["not", "a", "record"],
          attempts_done: 0,
          max_attempts: 8,
        },
        {
          id: "45",
          kind: "reminder_rule_upsert",
          idempotency_key: "reminder_rule:ok",
          payload: { id: "ok" },
          attempts_done: 0,
          max_attempts: 8,
        },
      ],
    });
    const pool = { connect: vi.fn() } as unknown as import("pg").Pool;
    const rows = await claimDueIntegratorPushJobs(pool, 5);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("45");
  });

  it("completeIntegratorPushJob marks row done", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    drizzleDb.update.mockReturnValue({ set });
    const pool = { connect: vi.fn() } as unknown as import("pg").Pool;

    await completeIntegratorPushJob(pool, "99");
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: "done" }));
    expect(where).toHaveBeenCalled();
  });

  it("failIntegratorPushJobDead truncates last_error", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    drizzleDb.update.mockReturnValue({ set });
    const pool = { connect: vi.fn() } as unknown as import("pg").Pool;

    await failIntegratorPushJobDead(pool, "99", "x".repeat(5000));
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "dead",
        lastError: "x".repeat(4000),
      }),
    );
  });

  it("rescheduleIntegratorPushJob sets pending backoff", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    drizzleDb.update.mockReturnValue({ set });
    const pool = { connect: vi.fn() } as unknown as import("pg").Pool;

    await rescheduleIntegratorPushJob(pool, "99", 2, 30, "retry me");
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        attemptsDone: 2,
        lastError: "retry me",
      }),
    );
  });

  it("uses getWebappSqlFromPgClient when executor is PoolClient", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    drizzleDb.insert.mockReturnValue({ values });
    const client = { query: vi.fn() } as unknown as import("pg").PoolClient;

    await enqueueIntegratorPush(client, {
      kind: "system_settings_sync",
      idempotencyKey: "settings:admin:x",
      payload: {},
    });
    expect(getWebappSqlFromPgClientMock).toHaveBeenCalledWith(client);
    expect(getWebappSqlDbMock).not.toHaveBeenCalled();
  });
});
