import {
  runWithDbInfraPrincipal,
  runWithDbIntegratorPrincipal,
  runWithDbOrganizationPrincipal,
  runWithDbPatientPrincipal,
  runWithDbStaffPrincipal,
} from "@bersoncare/db-principal";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMediaWorkerPoolProvider } from "./poolProvider.js";
import { startMediaWorkerTransaction } from "./withClient.js";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PATIENT_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STAFF_USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const INTEGRATOR_USER_ID = 12345;

type PrincipalRunner = <T>(fn: () => T) => T;

const rejectedLockedDbPrincipals: ReadonlyArray<{
  name: string;
  run: PrincipalRunner;
  expectedMessage: string;
}> = [
  {
    name: "organization",
    run: (fn) => runWithDbOrganizationPrincipal(ORG_ID, fn),
    expectedMessage: "DB organization principal is not allowed on media-worker pool in locked mode",
  },
  {
    name: "patient",
    run: (fn) => runWithDbPatientPrincipal({ organizationId: ORG_ID, platformUserId: PATIENT_USER_ID }, fn),
    expectedMessage: "DB patient principal is not allowed on media-worker pool in locked mode",
  },
  {
    name: "staff",
    run: (fn) => runWithDbStaffPrincipal({ organizationId: ORG_ID, platformUserId: STAFF_USER_ID }, fn),
    expectedMessage: "DB staff principal is not allowed on media-worker pool in locked mode",
  },
  {
    name: "integrator",
    run: (fn) => runWithDbIntegratorPrincipal({ organizationId: ORG_ID, integratorUserId: INTEGRATOR_USER_ID }, fn),
    expectedMessage: "DB integrator principal is not allowed on media-worker pool in locked mode",
  },
];

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

  it("poisons a transaction client when principal cleanup fails", async () => {
    const cleanupErr = new Error("principal cleanup failed");
    const release = vi.fn();
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockRejectedValueOnce(cleanupErr);
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    const tx = await runWithDbOrganizationPrincipal("dddddddd-dddd-4ddd-8ddd-dddddddddddd", () =>
      startMediaWorkerTransaction(pool as never),
    );
    await tx.rollback();
    await expect(tx.release()).rejects.toBe(cleanupErr);

    expect(query.mock.calls).toEqual([
      ["SELECT set_config('app.org', $1, false)", ["dddddddd-dddd-4ddd-8ddd-dddddddddddd"]],
      ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
      ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
      ["BEGIN"],
      ["SELECT set_config('app.org', $1, true)", ["dddddddd-dddd-4ddd-8ddd-dddddddddddd"]],
      ["ROLLBACK"],
      ["SELECT set_config('app.org', $1, false)", [""]],
    ]);
    expect(release).toHaveBeenCalledWith(cleanupErr);
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

    const tx = await runWithDbInfraPrincipal({ source: "media-worker:tick" }, () =>
      startMediaWorkerTransaction(pool as never),
    );
    await tx.commit();
    await tx.release();

    expect(query.mock.calls).toContainEqual(["BEGIN"]);
    expect(query.mock.calls.at(-2)).toEqual(["SELECT app.release_principal_context()"]);
    expect(query.mock.calls.at(-1)).toEqual(["RESET ROLE"]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("fails closed in locked mode before checkout when no DB principal is active", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await expect(startMediaWorkerTransaction(pool as never)).rejects.toThrow(
      "DB principal context is required before media-worker scoped DB access in locked mode",
    );

    expect(pool.connect).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  for (const testCase of rejectedLockedDbPrincipals) {
    it(`rejects ${testCase.name} locked DB principal before transaction checkout`, async () => {
      process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
      process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
      const release = vi.fn();
      const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      const client = { query, release };
      const pool = { connect: vi.fn(async () => client) };

      await expect(testCase.run(() => startMediaWorkerTransaction(pool as never))).rejects.toThrow(
        testCase.expectedMessage,
      );

      expect(pool.connect).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();
    });
  }

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

  it("poisons setup-failed transaction clients without masking the setup error", async () => {
    const release = vi.fn();
    const setupErr = new Error("transaction principal setup failed");
    const cleanupErr = new Error("principal cleanup failed after setup failure");
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockRejectedValueOnce(setupErr)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockRejectedValueOnce(cleanupErr);
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await expect(
      runWithDbOrganizationPrincipal("99999999-9999-4999-8999-999999999999", () =>
        startMediaWorkerTransaction(pool as never),
      ),
    ).rejects.toBe(setupErr);

    expect(query.mock.calls).toEqual([
      ["SELECT set_config('app.org', $1, false)", ["99999999-9999-4999-8999-999999999999"]],
      ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
      ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
      ["BEGIN"],
      ["SELECT set_config('app.org', $1, true)", ["99999999-9999-4999-8999-999999999999"]],
      ["ROLLBACK"],
      ["SELECT set_config('app.org', $1, false)", [""]],
    ]);
    expect(release).toHaveBeenCalledWith(cleanupErr);
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

    await runWithDbInfraPrincipal({ source: "media-worker:tick" }, () =>
      pool.query("SELECT ok"),
    );
    await pool.end();

    expect(query.mock.calls).toContainEqual(["SELECT ok"]);
    expect(query.mock.calls).toContainEqual(["SET ROLE app_operational_media_worker"]);
    expect(query.mock.calls.at(-2)).toEqual(["SELECT app.release_principal_context()"]);
    expect(query.mock.calls.at(-1)).toEqual(["RESET ROLE"]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("poisons provider pool.query clients when principal cleanup fails", async () => {
    const cleanupErr = new Error("provider principal cleanup failed");
    const release = vi.fn();
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ ok: true }], rowCount: 1 })
      .mockRejectedValueOnce(cleanupErr);
    const client = { query, release };
    vi.spyOn(Pool.prototype, "connect").mockResolvedValue(client as never);
    vi.spyOn(Pool.prototype, "end").mockResolvedValue(undefined);
    const pool = createMediaWorkerPoolProvider({ connectionString: "postgres://example/test" });

    await expect(
      runWithDbOrganizationPrincipal("77777777-7777-4777-8777-777777777777", () =>
        pool.query("SELECT ok"),
      ),
    ).rejects.toBe(cleanupErr);
    await pool.end();

    expect(query.mock.calls).toEqual([
      ["SELECT set_config('app.org', $1, false)", ["77777777-7777-4777-8777-777777777777"]],
      ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
      ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
      ["SELECT ok"],
      ["SELECT set_config('app.org', $1, false)", [""]],
    ]);
    expect(release).toHaveBeenCalledWith(cleanupErr);
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

  for (const testCase of rejectedLockedDbPrincipals) {
    it(`rejects ${testCase.name} locked DB principal before pool.query checkout`, async () => {
      process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
      process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
      const connect = vi.spyOn(Pool.prototype, "connect");
      const pool = createMediaWorkerPoolProvider({ connectionString: "postgres://example/test" });

      await expect(testCase.run(() => pool.query("SELECT ok"))).rejects.toThrow(testCase.expectedMessage);
      await pool.end();

      expect(connect).not.toHaveBeenCalled();
    });
  }

  it("rejects missing locked DB principal before pool.query checkout", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    const connect = vi.spyOn(Pool.prototype, "connect");
    const pool = createMediaWorkerPoolProvider({ connectionString: "postgres://example/test" });

    await expect(pool.query("SELECT ok")).rejects.toThrow(
      "DB principal context is required before media-worker scoped DB access in locked mode",
    );
    await pool.end();

    expect(connect).not.toHaveBeenCalled();
  });
});
