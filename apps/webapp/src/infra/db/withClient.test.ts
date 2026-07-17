/** @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import type { PoolClient, PoolConfig } from "pg";
import {
  enterWithDbStaffPrincipal,
  runWithDbBootstrapPrincipal,
  runWithDbInfraPrincipal,
  runWithDbOrganizationPrincipal,
  runWithDbPatientPrincipal,
} from "@bersoncare/db-principal";
import { createWebappPoolProvider } from "@/infra/db/webappPoolProvider";
import { startPoolTransaction, withPoolClient, withPoolTransaction } from "@/infra/db/withClient";

vi.mock("@/infra/db/saasIsolationDbFailureReporting", () => ({
  reportDbCleanupFailure: vi.fn(async () => undefined),
  reportDbQueryFailure: vi.fn(async () => undefined),
  reportPrincipalSetupFailure: vi.fn(async () => undefined),
}));

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
            ? { rows: [{ backend_pid: 8181 }], rowCount: 1 }
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

describe("withClient helpers", () => {
  const originalDbPrincipalContextMode = process.env.DB_PRINCIPAL_CONTEXT_MODE;
  const originalDbPrincipalSigningSecret = process.env.DB_PRINCIPAL_SIGNING_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    restoreEnvValue("DB_PRINCIPAL_CONTEXT_MODE", originalDbPrincipalContextMode);
    restoreEnvValue("DB_PRINCIPAL_SIGNING_SECRET", originalDbPrincipalSigningSecret);
  });

  afterEach(() => {
    restoreEnvValue("DB_PRINCIPAL_CONTEXT_MODE", originalDbPrincipalContextMode);
    restoreEnvValue("DB_PRINCIPAL_SIGNING_SECRET", originalDbPrincipalSigningSecret);
    vi.restoreAllMocks();
  });

  it("releases checked-out client after successful work", async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await expect(withPoolClient(pool as never, async () => "ok")).resolves.toBe("ok");

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(query.mock.calls).toEqual([
      ["SELECT set_config('app.org', $1, false)", [""]],
      ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
      ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
    ]);
  });

  it("destroys checked-out client when connection cleanup fails", async () => {
    const cleanupError = new Error("cleanup failed");
    const release = vi.fn();
    const query = vi.fn(async (sql: string) => {
      if (sql === "SELECT set_config('app.org', $1, false)") {
        throw cleanupError;
      }
      return { rows: [], rowCount: 0 };
    });
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await expect(withPoolClient(pool as never, async () => "ok")).rejects.toBe(cleanupError);

    expect(release).toHaveBeenCalledWith(cleanupError);
  });

  it("commits a successful transaction and releases client", async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await expect(withPoolTransaction(pool as never, async () => "tx-ok")).resolves.toBe("tx-ok");

    expect(query.mock.calls).toEqual([
      ["BEGIN"],
      ["COMMIT"],
      ["SELECT set_config('app.org', $1, false)", [""]],
      ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
      ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("applies the current organization principal once inside a transaction", async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await runWithDbOrganizationPrincipal("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA", () =>
      withPoolTransaction(pool as never, async () => "tx-ok"),
    );

    expect(query.mock.calls).toEqual([
      ["SELECT set_config('app.org', $1, false)", ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]],
      ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
      ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
      ["BEGIN"],
      ["SELECT set_config('app.org', $1, true)", ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]],
      ["COMMIT"],
      ["SELECT set_config('app.org', $1, false)", [""]],
      ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
      ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("uses locked DB principal options when opt-in env is set", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    const release = vi.fn();
    const query = vi.fn(async (sql: string, _values?: readonly unknown[]) =>
      sql === "SELECT pg_backend_pid() AS backend_pid"
        ? { rows: [{ backend_pid: 4242 }], rowCount: 1 }
        : { rows: [], rowCount: 0 },
    );
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await runWithDbOrganizationPrincipal("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", () =>
      withPoolClient(pool as never, async () => "ok"),
    );

    expect(query.mock.calls[0]).toEqual(["RESET ROLE"]);
    expect(query.mock.calls[1]).toEqual(["SET ROLE app_staff"]);
    expect(query.mock.calls[2]).toEqual(["SELECT pg_backend_pid() AS backend_pid"]);
    expect(String(query.mock.calls[3]?.[0])).toContain("app.install_signed_context");
    expect(query.mock.calls[3]?.[1]).toEqual(
      expect.arrayContaining([4242, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]),
    );
    expect(query.mock.calls.at(-2)).toEqual(["SELECT app.release_principal_context()"]);
    expect(query.mock.calls.at(-1)).toEqual(["RESET ROLE"]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("applies the principal captured before checkout instead of a later mutable-context value", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    let finishCheckout: (() => void) | undefined;
    let checkoutStarted: (() => void) | undefined;
    const checkoutGate = new Promise<void>((resolve) => {
      finishCheckout = resolve;
    });
    const checkoutSignal = new Promise<void>((resolve) => {
      checkoutStarted = resolve;
    });
    const release = vi.fn();
    const query = vi.fn(async (_sql: string) => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = {
      connect: vi.fn(async () => {
        checkoutStarted?.();
        await checkoutGate;
        return client;
      }),
    };

    await runWithDbBootstrapPrincipal({ source: "public-auth-bootstrap" }, async () => {
      const pending = withPoolClient(pool as never, async () => "ok");
      await checkoutSignal;
      enterWithDbStaffPrincipal({
        organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        platformUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      });
      finishCheckout?.();
      await expect(pending).resolves.toBe("ok");
    });

    const statements = query.mock.calls.map(([statement]) => statement);
    expect(statements).not.toContain("SET ROLE app_staff");
    expect(statements.some((statement) => String(statement).includes("app.install_signed_context"))).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it("fails closed in locked mode before checkout when no DB principal is active", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await expect(withPoolClient(pool as never, async () => "unused")).rejects.toThrow(
      "DB principal context is required before scoped DB access in locked mode",
    );

    expect(pool.connect).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it("fails closed in locked mode before checkout for infra principal", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    const pool = { connect: vi.fn() };

    await expect(
      runWithDbInfraPrincipal({ source: "unit-test" }, () => withPoolClient(pool as never, async () => "unused")),
    ).rejects.toThrow("DB infra principal is not allowed to use the webapp request DB pool in locked mode");

    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("rejects invalid locked DB principal env before checking out a client", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    delete process.env.DB_PRINCIPAL_SIGNING_SECRET;
    const pool = { connect: vi.fn() };

    await expect(withPoolClient(pool as never, async () => "unused")).rejects.toThrow(
      "DB_PRINCIPAL_SIGNING_SECRET is required",
    );

    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("starts a manual transaction handle through the same checkout path", async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    const tx = await startPoolTransaction(pool as never);
    await tx.commit();
    await tx.release();

    expect(query.mock.calls).toEqual([
      ["BEGIN"],
      ["COMMIT"],
      ["SELECT set_config('app.org', $1, false)", [""]],
      ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
      ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("applies the current organization principal to manual transaction handles", async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    const tx = await runWithDbOrganizationPrincipal("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", () =>
      startPoolTransaction(pool as never),
    );
    await tx.rollback();
    await tx.release();

    expect(query.mock.calls).toEqual([
      ["SELECT set_config('app.org', $1, false)", ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]],
      ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
      ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
      ["BEGIN"],
      ["SELECT set_config('app.org', $1, true)", ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]],
      ["ROLLBACK"],
      ["SELECT set_config('app.org', $1, false)", [""]],
      ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
      ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("keeps manual transaction checkout and signed context on the captured patient contour", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    const patientOrganizationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const patientUserId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    let finishCheckout: (() => void) | undefined;
    let checkoutStarted: (() => void) | undefined;
    const checkoutGate = new Promise<void>((resolve) => {
      finishCheckout = resolve;
    });
    const checkoutSignal = new Promise<void>((resolve) => {
      checkoutStarted = resolve;
    });
    const { factory, records } = createRoutedPoolTestFactory();
    const pool = createWebappPoolProvider({
      staffConnectionString: "postgres://staff/db",
      nonstaffConnectionString: "postgres://nonstaff/db",
      poolFactory: factory,
    });
    const nonstaffConnect = records[1]?.connect;
    nonstaffConnect?.mockImplementation(async () => {
      checkoutStarted?.();
      await checkoutGate;
      const nonstaffRecord = records[1];
      if (!nonstaffRecord) throw new Error("Missing nonstaff checkout implementation");
      return nonstaffRecord.checkout();
    });

    const tx = await runWithDbPatientPrincipal(
      { organizationId: patientOrganizationId, platformUserId: patientUserId },
      async () => {
        const pending = startPoolTransaction(pool);
        await checkoutSignal;
        enterWithDbStaffPrincipal({
          organizationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          platformUserId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        });
        finishCheckout?.();
        return pending;
      },
    );
    await tx.rollback();
    await tx.release();

    const client = records[1]?.clients[0];
    const statements = client?.query.mock.calls.map(([statement]) => statement) ?? [];
    const installCalls =
      client?.query.mock.calls.filter(([statement]) => String(statement).includes("app.install_signed_context")) ?? [];
    expect(records[1]?.config.connectionString).toBe("postgres://nonstaff/db");
    expect(records[0]?.connect).not.toHaveBeenCalled();
    expect(records[1]?.connect).toHaveBeenCalledOnce();
    expect(statements).toContain("SET ROLE app_patient");
    expect(statements).not.toContain("SET ROLE app_staff");
    expect(statements).toContain("ROLLBACK");
    expect(statements.at(-2)).toBe("SELECT app.release_principal_context()");
    expect(statements.at(-1)).toBe("RESET ROLE");
    expect(installCalls).toHaveLength(2);
    for (const installCall of installCalls) {
      expect(installCall[1]).toEqual(expect.arrayContaining([patientOrganizationId, patientUserId]));
      expect(installCall[1]).not.toContain("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    }
    expect(client?.release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases when transaction principal setup fails", async () => {
    const release = vi.fn();
    const err = new Error("set_config failed");
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await expect(
      runWithDbOrganizationPrincipal("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", () =>
        startPoolTransaction(pool as never),
      ),
    ).rejects.toBe(err);

    expect(query.mock.calls).toEqual([
      ["SELECT set_config('app.org', $1, false)", ["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"]],
      ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
      ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
      ["BEGIN"],
      ["SELECT set_config('app.org', $1, true)", ["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"]],
      ["ROLLBACK"],
      ["SELECT set_config('app.org', $1, false)", [""]],
      ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
      ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rolls back a failed transaction and releases client", async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };
    const err = new Error("boom");

    await expect(
      withPoolTransaction(pool as never, async () => {
        throw err;
      }),
    ).rejects.toBe(err);

    expect(query.mock.calls).toEqual([
      ["BEGIN"],
      ["ROLLBACK"],
      ["SELECT set_config('app.org', $1, false)", [""]],
      ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
      ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("wraps promise-form pool.query with locked DB principal options", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    const release = vi.fn();
    const query = vi.fn(async (sql: string, _values?: readonly unknown[]) =>
      sql === "SELECT pg_backend_pid() AS backend_pid"
        ? { rows: [{ backend_pid: 5252 }], rowCount: 1 }
        : { rows: [{ ok: true }], rowCount: 1 },
    );
    const client = { query, release };
    vi.spyOn(Pool.prototype, "connect").mockResolvedValue(client as never);
    vi.spyOn(Pool.prototype, "end").mockResolvedValue(undefined);
    const pool = createWebappPoolProvider({ connectionString: "postgres://example/test" });

    await runWithDbOrganizationPrincipal("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", () =>
      pool.query("SELECT ok"),
    );
    await pool.end();

    expect(query.mock.calls[0]).toEqual(["RESET ROLE"]);
    expect(query.mock.calls[1]).toEqual(["SET ROLE app_staff"]);
    expect(query.mock.calls[2]).toEqual(["SELECT pg_backend_pid() AS backend_pid"]);
    expect(String(query.mock.calls[3]?.[0])).toContain("app.install_signed_context");
    expect(query.mock.calls[4]).toEqual(["SELECT ok"]);
    expect(query.mock.calls.at(-2)).toEqual(["SELECT app.release_principal_context()"]);
    expect(query.mock.calls.at(-1)).toEqual(["RESET ROLE"]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rejects callback-form pool.query at the provider chokepoint", async () => {
    const pool = createWebappPoolProvider({ connectionString: "postgres://example/test" });

    expect(() =>
      pool.query("SELECT ok", () => undefined),
    ).toThrow("Callback-form pool.query is forbidden");
    await pool.end();
  });

  it("rejects invalid locked DB principal env before pool.query checkout", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    delete process.env.DB_PRINCIPAL_SIGNING_SECRET;
    const connect = vi.spyOn(Pool.prototype, "connect");
    const pool = createWebappPoolProvider({ connectionString: "postgres://example/test" });

    await expect(pool.query("SELECT ok")).rejects.toThrow("DB_PRINCIPAL_SIGNING_SECRET is required");
    await pool.end();

    expect(connect).not.toHaveBeenCalled();
  });
});
