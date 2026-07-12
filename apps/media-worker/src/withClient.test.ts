import { runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMediaWorkerPoolProvider } from "./poolProvider.js";
import { startMediaWorkerTransaction } from "./withClient.js";

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe("media-worker DB client helpers", () => {
  const originalDbPrincipalContextMode = process.env.DB_PRINCIPAL_CONTEXT_MODE;
  const originalDbPrincipalSigningSecret = process.env.DB_PRINCIPAL_SIGNING_SECRET;

  beforeEach(() => {
    restoreEnvValue("DB_PRINCIPAL_CONTEXT_MODE", originalDbPrincipalContextMode);
    restoreEnvValue("DB_PRINCIPAL_SIGNING_SECRET", originalDbPrincipalSigningSecret);
  });

  afterEach(() => {
    restoreEnvValue("DB_PRINCIPAL_CONTEXT_MODE", originalDbPrincipalContextMode);
    restoreEnvValue("DB_PRINCIPAL_SIGNING_SECRET", originalDbPrincipalSigningSecret);
    vi.restoreAllMocks();
  });

  it("keeps transactions unchanged when no principal is set", async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    const tx = await startMediaWorkerTransaction(pool as never);
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

  it("applies the current organization principal inside a transaction", async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    const tx = await runWithDbOrganizationPrincipal("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", () =>
      startMediaWorkerTransaction(pool as never),
    );
    await tx.rollback();
    await tx.release();

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

  it("uses locked DB principal options when opt-in env is set", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    const release = vi.fn();
    const query = vi.fn(async (sql: string, _values?: readonly unknown[]) =>
      sql === "SELECT pg_backend_pid() AS backend_pid"
        ? { rows: [{ backend_pid: 8282 }], rowCount: 1 }
        : { rows: [], rowCount: 0 },
    );
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    const tx = await runWithDbOrganizationPrincipal("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", () =>
      startMediaWorkerTransaction(pool as never),
    );
    await tx.commit();
    await tx.release();

    expect(query.mock.calls[0]).toEqual(["RESET ROLE"]);
    expect(query.mock.calls[1]).toEqual(["SET ROLE app_staff"]);
    expect(query.mock.calls[2]).toEqual(["SELECT pg_backend_pid() AS backend_pid"]);
    expect(String(query.mock.calls[3]?.[0])).toContain("app.install_signed_context");
    expect(query.mock.calls[3]?.[1]).toEqual(
      expect.arrayContaining([8282, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]),
    );
    expect(query.mock.calls[4]).toEqual(["BEGIN"]);
    expect(query.mock.calls[5]).toEqual(["RESET ROLE"]);
    expect(query.mock.calls[6]).toEqual(["SET ROLE app_staff"]);
    expect(String(query.mock.calls[8]?.[0])).toContain("app.install_signed_context");
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

    await expect(startMediaWorkerTransaction(pool as never)).rejects.toThrow(
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

    await expect(startMediaWorkerTransaction(pool as never)).rejects.toThrow(
      "DB_PRINCIPAL_SIGNING_SECRET is required",
    );

    expect(pool.connect).not.toHaveBeenCalled();
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
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await expect(
      runWithDbOrganizationPrincipal("ffffffff-ffff-4fff-8fff-ffffffffffff", () =>
        startMediaWorkerTransaction(pool as never),
      ),
    ).rejects.toBe(err);

    expect(query.mock.calls).toEqual([
      ["SELECT set_config('app.org', $1, false)", ["ffffffff-ffff-4fff-8fff-ffffffffffff"]],
      ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
      ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
      ["BEGIN"],
      ["SELECT set_config('app.org', $1, true)", ["ffffffff-ffff-4fff-8fff-ffffffffffff"]],
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
        ? { rows: [{ backend_pid: 9292 }], rowCount: 1 }
        : { rows: [{ ok: true }], rowCount: 1 },
    );
    const client = { query, release };
    vi.spyOn(Pool.prototype, "connect").mockResolvedValue(client as never);
    vi.spyOn(Pool.prototype, "end").mockResolvedValue(undefined);
    const pool = createMediaWorkerPoolProvider({ connectionString: "postgres://example/test" });

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
    const pool = createMediaWorkerPoolProvider({ connectionString: "postgres://example/test" });

    expect(() =>
      pool.query("SELECT ok", () => undefined),
    ).toThrow("Callback-form pool.query is forbidden");
    await pool.end();
  });

  it("rejects invalid locked DB principal env before pool.query checkout", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    delete process.env.DB_PRINCIPAL_SIGNING_SECRET;
    const connect = vi.spyOn(Pool.prototype, "connect");
    const pool = createMediaWorkerPoolProvider({ connectionString: "postgres://example/test" });

    await expect(pool.query("SELECT ok")).rejects.toThrow("DB_PRINCIPAL_SIGNING_SECRET is required");
    await pool.end();

    expect(connect).not.toHaveBeenCalled();
  });
});
