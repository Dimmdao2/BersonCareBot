/** @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";
import { createWebappPoolProvider } from "@/infra/db/webappPoolProvider";
import { startPoolTransaction, withPoolClient, withPoolTransaction } from "@/infra/db/withClient";

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
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

  it("fails closed in locked mode when no DB principal is active", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await expect(withPoolClient(pool as never, async () => "unused")).rejects.toThrow(
      "DB principal context is required before scoped DB access in locked mode",
    );

    expect(query.mock.calls).toEqual([
      ["SELECT app.release_principal_context()"],
      ["RESET ROLE"],
      ["SELECT app.release_principal_context()"],
      ["RESET ROLE"],
    ]);
    expect(release).toHaveBeenCalledTimes(1);
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
