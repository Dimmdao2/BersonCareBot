import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enterWithDbStaffPrincipal,
  runWithDbOrganizationPrincipal,
  runWithDbPatientPrincipal,
  runWithDbPlatformPrincipal,
} from "@bersoncare/db-principal";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Pool, PoolClient, PoolConfig } from "pg";
import { createWebappPoolProvider } from "@/infra/db/webappPoolProvider";

const transactionMock = vi.hoisted(() => vi.fn());
const executeMock = vi.hoisted(() => vi.fn());
const drizzleHarness = vi.hoisted(() => ({ pool: undefined as unknown }));
const reportDbCleanupFailureMock = vi.hoisted(() => vi.fn(async () => undefined));
const reportDbQueryFailureMock = vi.hoisted(() => vi.fn(async () => undefined));
const reportPrincipalSetupFailureMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/infra/db/saasIsolationDbFailureReporting", () => ({
  reportDbCleanupFailure: reportDbCleanupFailureMock,
  reportDbQueryFailure: reportDbQueryFailureMock,
  reportPrincipalSetupFailure: reportPrincipalSetupFailureMock,
}));

vi.mock("./client", () => ({
  getPool: vi.fn(() => {
    if (!drizzleHarness.pool) throw new Error("Drizzle test pool is not configured");
    return drizzleHarness.pool;
  }),
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => ({
    transaction: (...args: readonly unknown[]) => transactionMock(drizzleHarness.pool, ...args),
  })),
}));

import { getDrizzle } from "./drizzle";
import { runWebappTransaction } from "@/infra/db/runWebappSql";

const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

type RoutedPoolTestRecord = {
  config: PoolConfig;
  connect: ReturnType<typeof vi.fn>;
  checkout: () => Promise<PoolClient>;
  clients: Array<{ query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }>;
};

function createRoutedPoolTestFactory(): {
  factory: (config: PoolConfig) => Pool;
  records: RoutedPoolTestRecord[];
} {
  const records: RoutedPoolTestRecord[] = [];
  const factory = (config: PoolConfig): Pool => {
    const clients: RoutedPoolTestRecord["clients"] = [];
    const checkout = async (): Promise<PoolClient> => {
      const client = {
        query: vi.fn(async (sql: string) =>
          sql === "SELECT pg_backend_pid() AS backend_pid"
            ? { rows: [{ backend_pid: 9191 }], rowCount: 1 }
            : { rows: [], rowCount: 0 },
        ),
        release: vi.fn(),
      };
      clients.push(client);
      return client as unknown as PoolClient;
    };
    const record: RoutedPoolTestRecord = { config, connect: vi.fn(checkout), checkout, clients };
    const partial: Partial<Pool> = {
      connect: record.connect as unknown as Pool["connect"],
      end: vi.fn(async () => undefined) as unknown as Pool["end"],
    };
    const pool = partial as Pool;
    partial.on = vi.fn(() => pool) as unknown as Pool["on"];
    Object.defineProperties(pool, {
      totalCount: { get: () => 0 },
      idleCount: { get: () => 0 },
      waitingCount: { get: () => 0 },
    });
    records.push(record);
    return pool;
  };
  return { factory, records };
}

describe("getDrizzle transaction principal", () => {
  const dialect = new PgDialect();
  const originalDbPrincipalContextMode = process.env.DB_PRINCIPAL_CONTEXT_MODE;
  const originalDbPrincipalSigningSecret = process.env.DB_PRINCIPAL_SIGNING_SECRET;

  beforeEach(() => {
    transactionMock.mockReset();
    executeMock.mockReset();
    reportDbCleanupFailureMock.mockClear();
    reportDbQueryFailureMock.mockClear();
    reportPrincipalSetupFailureMock.mockClear();
    drizzleHarness.pool = { query: vi.fn() };
    transactionMock.mockImplementation(
      async (_pool: Pool, callback: (tx: { execute: typeof executeMock }) => Promise<unknown>) =>
        callback({ execute: executeMock }),
    );
  });

  afterEach(() => {
    restoreEnvValue("DB_PRINCIPAL_CONTEXT_MODE", originalDbPrincipalContextMode);
    restoreEnvValue("DB_PRINCIPAL_SIGNING_SECRET", originalDbPrincipalSigningSecret);
  });

  it("does not set app.org when no DB principal is active", async () => {
    const db = getDrizzle();

    await db.transaction(async () => "ok");

    expect(executeMock).not.toHaveBeenCalled();
  });

  it("sets app.org inside Drizzle transactions when DB principal is active", async () => {
    const db = getDrizzle();

    await runWithDbOrganizationPrincipal(ORGANIZATION_ID, () =>
      db.transaction(async () => {
        expect(executeMock).toHaveBeenCalledTimes(1);
        return "ok";
      }),
    );

    const principalSql = executeMock.mock.calls[0]?.[0] as SQL;
    const compiled = dialect.sqlToQuery(principalSql);
    expect(compiled.sql).toBe("SELECT set_config('app.org', $1, true)");
    expect(compiled.params).toEqual([ORGANIZATION_ID]);
  });

  it("runs a platform write through the principal-aware transaction and resets the role", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    executeMock.mockImplementation(async () => ({ rows: [], rowCount: 0 }));

    await expect(
      runWithDbPlatformPrincipal(
        {
          platformUserId: "77777777-7777-4777-8777-777777777777",
          source: "drizzle-platform-write-test",
        },
        () =>
          runWebappTransaction(async (tx) => {
            await tx.execute(sql`UPDATE public.system_settings SET updated_at = now() WHERE key = ${"test"}`);
            return "written";
          }),
      ),
    ).resolves.toBe("written");

    const statements = executeMock.mock.calls.map(([statement]) => dialect.sqlToQuery(statement as SQL));
    expect(statements.map(({ sql: text }) => text)).toEqual([
      "SET ROLE app_platform_settings",
      "SELECT set_config('app.org', $1, true)",
      "SELECT set_config('app.patient_user_id', $1, true)",
      "SELECT set_config('app.integrator_user_id', $1, true)",
      "UPDATE public.system_settings SET updated_at = now() WHERE key = $1",
      "SELECT set_config('app.org', $1, true)",
      "SELECT set_config('app.patient_user_id', $1, true)",
      "SELECT set_config('app.integrator_user_id', $1, true)",
      "RESET ROLE",
    ]);
    expect(statements[4]?.params).toEqual(["test"]);
  });

  it("resets the platform role when principal setup fails after SET ROLE", async () => {
    const setupError = new Error("platform context clear failed");
    let failedSetupClear = false;
    executeMock.mockImplementation(async (statement: SQL) => {
      const compiled = dialect.sqlToQuery(statement);
      if (!failedSetupClear && compiled.sql === "SELECT set_config('app.org', $1, true)") {
        failedSetupClear = true;
        throw setupError;
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(
      runWithDbPlatformPrincipal({ platformUserId: "77777777-7777-4777-8777-777777777777" }, () =>
        runWebappTransaction(async () => "not-run"),
      ),
    ).rejects.toBe(setupError);

    const statements = executeMock.mock.calls.map(([statement]) => dialect.sqlToQuery(statement as SQL).sql);
    expect(statements).toEqual([
      "SET ROLE app_platform_settings",
      "SELECT set_config('app.org', $1, true)",
      "SELECT set_config('app.org', $1, true)",
      "SELECT set_config('app.patient_user_id', $1, true)",
      "SELECT set_config('app.integrator_user_id', $1, true)",
      "RESET ROLE",
    ]);
  });

  it("resets the platform role when the transaction callback fails", async () => {
    const callbackError = new Error("platform write failed");
    executeMock.mockImplementation(async () => ({ rows: [], rowCount: 0 }));

    await expect(
      runWithDbPlatformPrincipal({ platformUserId: "77777777-7777-4777-8777-777777777777" }, () =>
        runWebappTransaction(async (tx) => {
          await tx.execute(sql`UPDATE public.system_settings SET updated_at = now() WHERE key = ${"test"}`);
          throw callbackError;
        }),
      ),
    ).rejects.toBe(callbackError);

    const statements = executeMock.mock.calls.map(([statement]) => dialect.sqlToQuery(statement as SQL).sql);
    expect(statements.at(-1)).toBe("RESET ROLE");
    expect(statements).toContain("UPDATE public.system_settings SET updated_at = now() WHERE key = $1");
  });

  it("preserves a 42501 query error when aborted-transaction cleanup returns 25P02", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    const queryError = Object.assign(new Error("permission denied for table support_conversations"), {
      code: "42501",
    });
    const cleanupError = Object.assign(new Error("current transaction is aborted"), {
      code: "25P02",
    });
    const lifecycle: string[] = [];
    let transactionAborted = false;

    transactionMock.mockImplementation(
      async (_pool: Pool, callback: (tx: { execute: typeof executeMock }) => Promise<unknown>) => {
        lifecycle.push("BEGIN");
        try {
          const result = await callback({ execute: executeMock });
          lifecycle.push("COMMIT");
          return result;
        } catch (error) {
          lifecycle.push("ROLLBACK");
          transactionAborted = false;
          throw error;
        } finally {
          lifecycle.push("RELEASE");
        }
      },
    );
    executeMock.mockImplementation(async (statement: SQL) => {
      const compiled = dialect.sqlToQuery(statement);
      if (transactionAborted) {
        throw cleanupError;
      }
      if (compiled.sql.includes("UPDATE public.support_conversations")) {
        transactionAborted = true;
        throw queryError;
      }
      if (compiled.sql === "SELECT pg_backend_pid() AS backend_pid") {
        return { rows: [{ backend_pid: 9191 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(
      runWithDbPatientPrincipal(
        {
          organizationId: "33333333-3333-4333-8333-333333333333",
          platformUserId: "44444444-4444-4444-8444-444444444444",
        },
        () =>
          runWebappTransaction(async (tx) => {
            await tx.execute(sql`UPDATE public.support_conversations SET updated_at = now()`);
          }),
      ),
    ).rejects.toBe(queryError);

    expect(lifecycle).toEqual(["BEGIN", "ROLLBACK", "RELEASE"]);
    expect(reportDbQueryFailureMock).toHaveBeenCalledWith(queryError);
    expect(reportDbCleanupFailureMock).toHaveBeenCalledOnce();
    expect(transactionAborted).toBe(false);
  });

  it("keeps routed Drizzle checkout and signed transaction context on the captured patient contour", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    const patientOrganizationId = "33333333-3333-4333-8333-333333333333";
    const patientUserId = "44444444-4444-4444-8444-444444444444";
    let finishCheckout: (() => void) | undefined;
    let checkoutStarted: (() => void) | undefined;
    const checkoutGate = new Promise<void>((resolve) => {
      finishCheckout = resolve;
    });
    const checkoutSignal = new Promise<void>((resolve) => {
      checkoutStarted = resolve;
    });
    const { factory, records } = createRoutedPoolTestFactory();
    const routedPool = createWebappPoolProvider({
      staffConnectionString: "postgres://staff/db",
      nonstaffConnectionString: "postgres://nonstaff/db",
      poolFactory: factory,
    });
    drizzleHarness.pool = routedPool;
    const nonstaffConnect = records[1]?.connect;
    nonstaffConnect?.mockImplementation(async () => {
      checkoutStarted?.();
      await checkoutGate;
      const nonstaffRecord = records[1];
      if (!nonstaffRecord) throw new Error("Missing nonstaff checkout implementation");
      return nonstaffRecord.checkout();
    });
    transactionMock.mockImplementation(
      async (
        pool: Pool,
        callback: (tx: { execute: (statement: SQL) => Promise<unknown> }) => Promise<unknown>,
      ) => {
        const client = await pool.connect();
        const execute = async (statement: SQL): Promise<unknown> => {
          const compiled = dialect.sqlToQuery(statement);
          return client.query(compiled.sql, compiled.params);
        };
        await client.query("BEGIN");
        try {
          const result = await callback({ execute });
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
    );
    const db = getDrizzle();

    await runWithDbPatientPrincipal(
      { organizationId: patientOrganizationId, platformUserId: patientUserId },
      async () => {
        const pending = db.transaction(async () => "ok");
        await checkoutSignal;
        enterWithDbStaffPrincipal({
          organizationId: "55555555-5555-4555-8555-555555555555",
          platformUserId: "66666666-6666-4666-8666-666666666666",
        });
        finishCheckout?.();
        await expect(pending).resolves.toBe("ok");
      },
    );

    const client = records[1]?.clients[0];
    const statements = client?.query.mock.calls.map(([statement]) => statement) ?? [];
    const installCall = client?.query.mock.calls.find(([statement]) =>
      String(statement).includes("app.install_signed_context"),
    );
    expect(records[1]?.config.connectionString).toBe("postgres://nonstaff/db");
    expect(records[0]?.connect).not.toHaveBeenCalled();
    expect(records[1]?.connect).toHaveBeenCalledOnce();
    expect(statements).toContain("SET ROLE app_patient");
    expect(statements).not.toContain("SET ROLE app_staff");
    expect(installCall?.[1]).toEqual(expect.arrayContaining([patientOrganizationId, patientUserId]));
    expect(installCall?.[1]).not.toContain("55555555-5555-4555-8555-555555555555");
    expect(statements.slice(-3)).toEqual(["SELECT app.release_principal_context()", "RESET ROLE", "COMMIT"]);
    expect(client?.release).toHaveBeenCalledOnce();
  });
});
