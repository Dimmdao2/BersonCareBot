/** @vitest-environment node */

import type { Pool, PoolClient, PoolConfig } from "pg";
import {
  enterWithDbStaffPrincipal,
  getCurrentDbPrincipal,
  runWithDbBootstrapPrincipal,
  runWithDbInfraPrincipal,
  runWithDbPatientPrincipal,
  runWithDbPlatformPrincipal,
  runWithDbStaffPrincipal,
} from "@bersoncare/db-principal";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveWebappPoolProviderConfig } from "@/infra/db/client";
import {
  createWebappPoolProvider,
  getWebappPoolRoutingMetrics,
  WEB_PUSH_REMINDER_INFRA_SOURCE,
} from "@/infra/db/webappPoolProvider";
import { createSaasIsolationTelemetryPoolProvider } from "@/infra/db/saasIsolationTelemetryPoolProvider";
import { createConfigReaderPoolProvider } from "@/infra/db/configReaderPoolProvider";
import { runWithWebappDbOperationFamily } from "@/infra/db/saasIsolationOperationContext";

const { reportSaasIsolationEventBestEffortMock } = vi.hoisted(() => ({
  reportSaasIsolationEventBestEffortMock: vi.fn(async () => undefined),
}));

vi.mock("@/infra/saasIsolationReporterRuntime", () => ({
  reportSaasIsolationEventBestEffort: reportSaasIsolationEventBestEffortMock,
}));

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STAFF_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PATIENT_USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type FakeClient = {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
};

type FakePoolRecord = {
  config: PoolConfig;
  connect: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  clients: FakeClient[];
};

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function createFakeClient(queryImpl?: (sql: string, values?: readonly unknown[]) => Promise<unknown>): FakeClient {
  return {
    query: vi.fn(queryImpl ?? (async () => ({ rows: [], rowCount: 0 }))),
    release: vi.fn(),
  };
}

function createFakePoolFactory(queryImpl?: (sql: string, values?: readonly unknown[]) => Promise<unknown>): {
  factory: (config: PoolConfig) => Pool;
  pools: FakePoolRecord[];
} {
  const pools: FakePoolRecord[] = [];
  const factory = (config: PoolConfig): Pool => {
    const record: FakePoolRecord = {
      config,
      connect: vi.fn(async () => {
        const client = createFakeClient(queryImpl);
        record.clients.push(client);
        return client as unknown as PoolClient;
      }),
      end: vi.fn(async () => undefined),
      clients: [],
    };
    const partialPool: Partial<Pool> = {};
    const pool = partialPool as Pool;
    partialPool.connect = record.connect as unknown as Pool["connect"];
    partialPool.end = record.end as unknown as Pool["end"];
    partialPool.on = vi.fn(() => pool) as unknown as Pool["on"];
    partialPool.once = vi.fn(() => pool) as unknown as Pool["once"];
    partialPool.off = vi.fn(() => pool) as unknown as Pool["off"];
    partialPool.removeListener = vi.fn(() => pool) as unknown as Pool["removeListener"];
    Object.defineProperties(pool, {
      totalCount: { get: () => 0 },
      idleCount: { get: () => 0 },
      waitingCount: { get: () => 0 },
    });
    pools.push(record);
    return pool;
  };
  return { factory, pools };
}

describe("webapp pool provider", () => {
  const originalDbPrincipalContextMode = process.env.DB_PRINCIPAL_CONTEXT_MODE;
  const originalDbPrincipalSigningSecret = process.env.DB_PRINCIPAL_SIGNING_SECRET;

  beforeEach(() => {
    reportSaasIsolationEventBestEffortMock.mockClear();
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "legacy-guc";
    delete process.env.DB_PRINCIPAL_SIGNING_SECRET;
  });

  afterEach(() => {
    restoreEnvValue("DB_PRINCIPAL_CONTEXT_MODE", originalDbPrincipalContextMode);
    restoreEnvValue("DB_PRINCIPAL_SIGNING_SECRET", originalDbPrincipalSigningSecret);
    vi.restoreAllMocks();
  });

  it("creates the dedicated SaaS telemetry pool with one bounded connection", () => {
    const { factory, pools } = createFakePoolFactory();
    createSaasIsolationTelemetryPoolProvider({
      connectionString: "postgres://telemetry/db",
      applicationName: "bcb_saas_isolation_operator",
      poolFactory: factory,
    });

    expect(pools).toHaveLength(1);
    expect(pools[0]?.config).toMatchObject({
      connectionString: "postgres://telemetry/db",
      application_name: "bcb_saas_isolation_operator",
      max: 1,
      connectionTimeoutMillis: 250,
      query_timeout: 200,
      statement_timeout: 200,
      idle_in_transaction_session_timeout: 200,
    });
  });

  it("uses a dedicated config-reader pool with exact org setup and cleanup", async () => {
    const { factory, pools } = createFakePoolFactory();
    const provider = createConfigReaderPoolProvider({
      connectionString: "postgres://config-reader/db",
      poolFactory: factory,
    });

    await provider.withOrganizationContext(ORG_ID, async (client) => {
      await client.query("SELECT restricted_config_marker");
    });

    expect(pools).toHaveLength(1);
    expect(pools[0]?.config).toMatchObject({
      connectionString: "postgres://config-reader/db",
      max: 2,
      application_name: "bcb_webapp_config_reader",
    });
    const client = pools[0]?.clients[0];
    expect(client?.query.mock.calls).toEqual([
      ["SET ROLE app_config_reader"],
      ["SELECT set_config('app.org', $1, false)", [ORG_ID]],
      ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
      ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
      ["SELECT restricted_config_marker"],
      ["SELECT set_config('app.org', $1, false)", [""]],
      ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
      ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
      ["RESET ROLE"],
    ]);
    expect(client?.release).toHaveBeenCalledWith(undefined);
  });

  it("isolates concurrent config-reader org contexts and destroys a failed checkout", async () => {
    const failure = new Error("config read failed");
    const { factory, pools } = createFakePoolFactory();
    const provider = createConfigReaderPoolProvider({
      connectionString: "postgres://config-reader/db",
      poolFactory: factory,
    });
    const secondOrg = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

    const results = await Promise.allSettled([
      provider.withOrganizationContext(ORG_ID, async (client) => {
        await client.query("SELECT first_org");
        return "first";
      }),
      provider.withOrganizationContext(secondOrg, async (client) => {
        await client.query("SELECT second_org");
        throw failure;
      }),
    ]);

    expect(results[0]).toMatchObject({ status: "fulfilled", value: "first" });
    expect(results[1]).toMatchObject({ status: "rejected", reason: failure });
    expect(pools[0]?.clients).toHaveLength(2);
    expect(pools[0]?.clients[0]?.query.mock.calls).toContainEqual([
      "SELECT set_config('app.org', $1, false)",
      [ORG_ID],
    ]);
    expect(pools[0]?.clients[1]?.query.mock.calls).toContainEqual([
      "SELECT set_config('app.org', $1, false)",
      [secondOrg],
    ]);
    expect(pools[0]?.clients[0]?.release).toHaveBeenCalledWith(undefined);
    expect(pools[0]?.clients[1]?.release).toHaveBeenCalledWith(failure);
  });

  it("clears partial config-reader context when setup fails after role selection", async () => {
    const failure = new Error("context setup failed");
    let failPatientContextOnce = true;
    const { factory, pools } = createFakePoolFactory(async (sql) => {
      if (failPatientContextOnce && sql.includes("app.patient_user_id")) {
        failPatientContextOnce = false;
        throw failure;
      }
      return { rows: [], rowCount: 0 };
    });
    const provider = createConfigReaderPoolProvider({
      connectionString: "postgres://config-reader/db",
      poolFactory: factory,
    });

    await expect(
      provider.withOrganizationContext(ORG_ID, async () => {
        throw new Error("operation must not run");
      }),
    ).rejects.toBe(failure);

    const client = pools[0]?.clients[0];
    expect(client?.query.mock.calls).toContainEqual(["SELECT set_config('app.org', $1, false)", [""]]);
    expect(client?.query.mock.calls.at(-1)).toEqual(["RESET ROLE"]);
    expect(client?.release).toHaveBeenCalledWith(failure);
  });

  it("routes staff and organization-scoped principals to the staff pool before checkout", async () => {
    const { factory, pools } = createFakePoolFactory();
    const pool = createWebappPoolProvider({
      staffConnectionString: "postgres://staff/db",
      nonstaffConnectionString: "postgres://nonstaff/db",
      poolFactory: factory,
    });

    await runWithDbStaffPrincipal({ organizationId: ORG_ID, platformUserId: STAFF_USER_ID }, () =>
      pool.query("SELECT staff_marker"),
    );

    expect(pools).toHaveLength(2);
    expect(pools[0]?.config).toMatchObject({ connectionString: "postgres://staff/db", max: 3 });
    expect(pools[1]?.config).toMatchObject({ connectionString: "postgres://nonstaff/db", max: 2 });
    expect(pools[0]?.connect).toHaveBeenCalledTimes(1);
    expect(pools[1]?.connect).not.toHaveBeenCalled();
    expect(getWebappPoolRoutingMetrics(pool)).toMatchObject({
      staffSelections: 1,
      nonstaffSelections: 0,
    });
  });

  it("routes the platform principal through staff transport, SET ROLEs narrowly, and cleans up", async () => {
    const { factory, pools } = createFakePoolFactory();
    const pool = createWebappPoolProvider({
      staffConnectionString: "postgres://staff/db",
      nonstaffConnectionString: "postgres://nonstaff/db",
      poolFactory: factory,
    });
    await runWithDbPlatformPrincipal({ platformUserId: STAFF_USER_ID, source: "platform-test" }, () =>
      pool.query("SELECT platform_settings_marker"),
    );
    expect(pools[0]?.connect).toHaveBeenCalledOnce();
    expect(pools[1]?.connect).not.toHaveBeenCalled();
    expect(pools[0]?.clients[0]?.query.mock.calls.map(([statement]) => statement)).toEqual(expect.arrayContaining([
      "SET ROLE app_platform_settings",
      "SELECT platform_settings_marker",
      "RESET ROLE",
    ]));
    expect(getWebappPoolRoutingMetrics(pool)).toMatchObject({ staffSelections: 1, nonstaffSelections: 0 });
  });

  it("routes patient, bootstrap, and missing principals to the nonstaff pool before checkout", async () => {
    const { factory, pools } = createFakePoolFactory();
    const pool = createWebappPoolProvider({
      staffConnectionString: "postgres://staff/db",
      nonstaffConnectionString: "postgres://nonstaff/db",
      poolFactory: factory,
    });

    await runWithDbPatientPrincipal({ organizationId: ORG_ID, platformUserId: PATIENT_USER_ID }, () =>
      pool.query("SELECT patient_marker"),
    );
    await runWithDbBootstrapPrincipal({ source: "unit-test" }, () => pool.query("SELECT bootstrap_marker"));
    await pool.query("SELECT missing_marker");

    expect(pools[0]?.connect).not.toHaveBeenCalled();
    expect(pools[1]?.connect).toHaveBeenCalledTimes(3);
    expect(getWebappPoolRoutingMetrics(pool)).toMatchObject({
      staffSelections: 0,
      nonstaffSelections: 3,
      missingPrincipalSelections: 1,
      bootstrapSelections: 1,
    });
  });

  it("keeps a bootstrap snapshot on the nonstaff pool when the request principal mutates during checkout", async () => {
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
    const { factory, pools } = createFakePoolFactory();
    const pool = createWebappPoolProvider({
      staffConnectionString: "postgres://staff/db",
      nonstaffConnectionString: "postgres://nonstaff/db",
      poolFactory: factory,
    });
    const client = createFakeClient(async (sql: string) =>
      sql === "SELECT pg_backend_pid() AS backend_pid"
        ? { rows: [{ backend_pid: 7171 }], rowCount: 1 }
        : { rows: [], rowCount: 0 },
    );
    pools[1]?.connect.mockImplementation(async () => {
      checkoutStarted?.();
      await checkoutGate;
      pools[1]?.clients.push(client);
      return client as unknown as PoolClient;
    });

    await runWithDbBootstrapPrincipal({ source: "public-auth-bootstrap" }, async () => {
      const pendingQuery = pool.query("SELECT bootstrap_marker");
      await checkoutSignal;
      enterWithDbStaffPrincipal({ organizationId: ORG_ID, platformUserId: STAFF_USER_ID });
      finishCheckout?.();
      await pendingQuery;
    });

    const statements = client.query.mock.calls.map(([statement]) => statement);
    expect(pools[0]?.connect).not.toHaveBeenCalled();
    expect(pools[1]?.connect).toHaveBeenCalledOnce();
    expect(statements).toContain("SELECT bootstrap_marker");
    expect(statements).not.toContain("SET ROLE app_staff");
    expect(statements.some((statement) => String(statement).includes("app.install_signed_context"))).toBe(false);
  });

  it("keeps a patient snapshot and role when the request principal mutates to staff during checkout", async () => {
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
    const { factory, pools } = createFakePoolFactory();
    const pool = createWebappPoolProvider({
      staffConnectionString: "postgres://staff/db",
      nonstaffConnectionString: "postgres://nonstaff/db",
      poolFactory: factory,
    });
    const client = createFakeClient(async (sql: string) =>
      sql === "SELECT pg_backend_pid() AS backend_pid"
        ? { rows: [{ backend_pid: 7272 }], rowCount: 1 }
        : { rows: [], rowCount: 0 },
    );
    pools[1]?.connect.mockImplementation(async () => {
      checkoutStarted?.();
      await checkoutGate;
      pools[1]?.clients.push(client);
      return client as unknown as PoolClient;
    });

    await runWithDbPatientPrincipal({ organizationId: ORG_ID, platformUserId: PATIENT_USER_ID }, async () => {
      const pendingQuery = pool.query("SELECT patient_marker");
      await checkoutSignal;
      enterWithDbStaffPrincipal({
        organizationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        platformUserId: STAFF_USER_ID,
      });
      finishCheckout?.();
      await pendingQuery;
    });

    const statements = client.query.mock.calls.map(([statement]) => statement);
    const installCall = client.query.mock.calls.find(([statement]) =>
      String(statement).includes("app.install_signed_context"),
    );
    expect(pools[0]?.connect).not.toHaveBeenCalled();
    expect(pools[1]?.connect).toHaveBeenCalledOnce();
    expect(statements).toContain("SET ROLE app_patient");
    expect(statements).not.toContain("SET ROLE app_staff");
    expect(installCall?.[1]).toEqual(expect.arrayContaining([ORG_ID, PATIENT_USER_ID]));
    expect(installCall?.[1]).not.toContain("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  });

  it.each([
    ["staff", runWithDbStaffPrincipal],
    ["patient", runWithDbPatientPrincipal],
  ] as const)(
    "temporarily routes a nested public-config bootstrap checkout from %s and restores the outer principal",
    async (kind, runOuter) => {
      const { factory, pools } = createFakePoolFactory();
      const pool = createWebappPoolProvider({
        staffConnectionString: "postgres://staff/db",
        nonstaffConnectionString: "postgres://nonstaff/db",
        poolFactory: factory,
      });

      await runOuter(
        {
          organizationId: ORG_ID,
          platformUserId: kind === "staff" ? STAFF_USER_ID : PATIENT_USER_ID,
        },
        async () => {
          expect(getCurrentDbPrincipal()?.kind).toBe(kind);
          await runWithWebappDbOperationFamily("public_auth_config", () =>
            runWithDbBootstrapPrincipal({ source: "webapp-public-runtime-config" }, () =>
              pool.query("SELECT public_config_marker"),
            ),
          );
          expect(getCurrentDbPrincipal()?.kind).toBe(kind);
        },
      );

      expect(pools[0]?.connect).not.toHaveBeenCalled();
      expect(pools[1]?.connect).toHaveBeenCalledTimes(1);
      expect(getCurrentDbPrincipal()).toBeUndefined();
      expect(getWebappPoolRoutingMetrics(pool)).toMatchObject({
        bootstrapSelections: 1,
        nonstaffSelections: 1,
        staffSelections: 0,
      });
    },
  );

  it("rejects missing and infra principals before dual-pool checkout in locked mode", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    const { factory, pools } = createFakePoolFactory();
    const pool = createWebappPoolProvider({
      staffConnectionString: "postgres://staff/db",
      nonstaffConnectionString: "postgres://nonstaff/db",
      poolFactory: factory,
    });

    await expect(pool.query("SELECT missing_marker")).rejects.toThrow(
      "DB principal context is required before scoped DB access in locked mode",
    );
    await expect(
      runWithDbInfraPrincipal({ source: "unit-test" }, () => pool.query("SELECT infra_marker")),
    ).rejects.toThrow("DB infra principal is not allowed to use the webapp request DB pool in locked mode");

    expect(pools[0]?.connect).not.toHaveBeenCalled();
    expect(pools[1]?.connect).not.toHaveBeenCalled();
    expect(getWebappPoolRoutingMetrics(pool)).toMatchObject({
      missingPrincipalSelections: 1,
      infraSelections: 1,
      staffSelections: 0,
      nonstaffSelections: 0,
    });
    expect(reportSaasIsolationEventBestEffortMock).toHaveBeenCalledWith({
      eventClass: "missing_principal",
      sourceService: "webapp",
      sourceOperation: "webapp_db_request",
    });
  });

  it("routes only the exact Web Push reminder infra source to its operational pool and cleans it", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    const { factory, pools } = createFakePoolFactory();
    const pool = createWebappPoolProvider({
      staffConnectionString: "postgres://staff/db",
      nonstaffConnectionString: "postgres://nonstaff/db",
      webPushReminderConnectionString: "postgres://webpush/db",
      poolFactory: factory,
    });

    await runWithDbInfraPrincipal({ source: WEB_PUSH_REMINDER_INFRA_SOURCE, organizationId: ORG_ID }, () =>
      pool.query("SELECT operational_marker"),
    );

    expect(pools).toHaveLength(3);
    expect(pools[2]?.config).toMatchObject({ connectionString: "postgres://webpush/db", max: 2 });
    expect(pools[0]?.connect).not.toHaveBeenCalled();
    expect(pools[1]?.connect).not.toHaveBeenCalled();
    expect(pools[2]?.connect).toHaveBeenCalledOnce();
    expect(pools[2]?.clients[0]?.query.mock.calls.map(([statement]) => statement)).toEqual([
      "SET ROLE app_operational_web_push_reminder",
      "SELECT set_config('app.org', $1, false)",
      "SELECT operational_marker",
      "SELECT set_config('app.org', '', false)",
      "RESET ROLE",
    ]);
    expect(pools[2]?.clients[0]?.query).toHaveBeenCalledWith("SELECT set_config('app.org', $1, false)", [ORG_ID]);
    expect(getWebappPoolRoutingMetrics(pool)).toMatchObject({ webPushReminderSelections: 1 });

    await expect(
      runWithDbInfraPrincipal({ source: "wrong-infra-source" }, () => pool.query("SELECT denied")),
    ).rejects.toThrow("DB infra principal is not allowed to use the webapp request DB pool in locked mode");
  });

  it("fails closed before checkout when the exact Web Push reminder source has no operational URL", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    const { factory, pools } = createFakePoolFactory();
    const pool = createWebappPoolProvider({
      staffConnectionString: "postgres://staff/db",
      nonstaffConnectionString: "postgres://nonstaff/db",
      poolFactory: factory,
    });

    await expect(
      runWithDbInfraPrincipal({ source: WEB_PUSH_REMINDER_INFRA_SOURCE }, () => pool.query("SELECT denied")),
    ).rejects.toThrow("DATABASE_URL_WEB_PUSH_REMINDER is required");
    expect(pools[0]?.connect).not.toHaveBeenCalled();
    expect(pools[1]?.connect).not.toHaveBeenCalled();
  });

  it("keeps the operational pool when request traffic uses one legacy connection string", async () => {
    const { factory, pools } = createFakePoolFactory();
    const pool = createWebappPoolProvider({
      connectionString: "postgres://legacy/db",
      webPushReminderConnectionString: "postgres://webpush/db",
      poolFactory: factory,
    });

    await runWithDbInfraPrincipal({ source: WEB_PUSH_REMINDER_INFRA_SOURCE }, () => pool.query("SELECT marker"));

    expect(pools).toHaveLength(3);
    expect(pools[2]?.config).toMatchObject({ connectionString: "postgres://webpush/db" });
    expect(pools[2]?.connect).toHaveBeenCalledOnce();
  });

  it("uses one legacy pool for both principals when only DATABASE_URL is resolved", async () => {
    const { factory, pools } = createFakePoolFactory();
    const config = resolveWebappPoolProviderConfig({
      DATABASE_URL: " postgres://legacy/db ",
      DATABASE_URL_STAFF: "",
      DATABASE_URL_NONSTAFF: "",
    });
    const pool = createWebappPoolProvider({ ...config, poolFactory: factory });

    await runWithDbStaffPrincipal({ organizationId: ORG_ID, platformUserId: STAFF_USER_ID }, () =>
      pool.query("SELECT staff_marker"),
    );
    await runWithDbPatientPrincipal({ organizationId: ORG_ID, platformUserId: PATIENT_USER_ID }, () =>
      pool.query("SELECT patient_marker"),
    );

    expect(config).toEqual({ connectionString: "postgres://legacy/db" });
    expect(pools).toHaveLength(1);
    expect(pools[0]?.config).toMatchObject({ connectionString: "postgres://legacy/db", max: 5 });
    expect(pools[0]?.connect).toHaveBeenCalledTimes(2);
    expect(getWebappPoolRoutingMetrics(pool)).toMatchObject({
      missingPrincipalSelections: 0,
    });
  });

  it("counts a missing principal on the legacy single-pool chokepoint", async () => {
    const { factory } = createFakePoolFactory();
    const pool = createWebappPoolProvider({ connectionString: "postgres://legacy/db", poolFactory: factory });

    await pool.query("SELECT missing_marker");

    expect(getWebappPoolRoutingMetrics(pool)).toMatchObject({ missingPrincipalSelections: 1 });
  });

  it("resolves dual connection strings without requiring legacy DATABASE_URL", () => {
    expect(
      resolveWebappPoolProviderConfig({
        DATABASE_URL: "",
        DATABASE_URL_STAFF: " postgres://staff/db ",
        DATABASE_URL_NONSTAFF: " postgres://nonstaff/db ",
      }),
    ).toEqual({
      connectionString: undefined,
      staffConnectionString: "postgres://staff/db",
      nonstaffConnectionString: "postgres://nonstaff/db",
    });
  });

  it("uses DATABASE_URL as the missing side fallback when only one dual URL is present", () => {
    expect(
      resolveWebappPoolProviderConfig({
        DATABASE_URL: "postgres://legacy/db",
        DATABASE_URL_STAFF: "postgres://staff/db",
        DATABASE_URL_NONSTAFF: "",
      }),
    ).toEqual({
      connectionString: "postgres://legacy/db",
      staffConnectionString: "postgres://staff/db",
      nonstaffConnectionString: "postgres://legacy/db",
    });
  });

  it("destroys the checked-out client when principal cleanup fails in pool.query", async () => {
    const cleanupError = new Error("cleanup failed");
    const { factory, pools } = createFakePoolFactory(async (sql: string) => {
      if (sql === "SELECT ok") {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (sql === "SELECT set_config('app.org', $1, false)") {
        throw cleanupError;
      }
      return { rows: [], rowCount: 0 };
    });
    const pool = createWebappPoolProvider({
      connectionString: "postgres://legacy/db",
      poolFactory: factory,
    });

    await expect(runWithWebappDbOperationFamily("public_booking_config", () => pool.query("SELECT ok"))).rejects.toBe(
      cleanupError,
    );

    expect(pools[0]?.clients[0]?.release).toHaveBeenCalledWith(cleanupError);
    expect(reportSaasIsolationEventBestEffortMock).toHaveBeenCalledWith({
      eventClass: "cleanup_failure",
      sourceService: "webapp",
      sourceOperation: "public_booking_config",
    });
  });

  it("classifies an injected PostgreSQL RLS denial without forwarding SQL or error text", async () => {
    const rlsError = Object.assign(new Error("new row violates row-level security policy for table private"), {
      code: "42501",
    });
    const { factory } = createFakePoolFactory(async (sql: string) => {
      if (sql === "SELECT tenant_data") throw rlsError;
      return { rows: [], rowCount: 0 };
    });
    const pool = createWebappPoolProvider({
      connectionString: "postgres://legacy/db",
      poolFactory: factory,
    });

    await expect(pool.query("SELECT tenant_data")).rejects.toBe(rlsError);

    expect(reportSaasIsolationEventBestEffortMock).toHaveBeenCalledWith({
      eventClass: "rls_denial",
      sourceService: "webapp",
      sourceOperation: "webapp_db_request",
    });
    expect(JSON.stringify(reportSaasIsolationEventBestEffortMock.mock.calls)).not.toContain("tenant_data");
    expect(JSON.stringify(reportSaasIsolationEventBestEffortMock.mock.calls)).not.toContain("private");
  });

  it.each([
    "public_auth_config",
    "auth_role_config",
    "patient_runtime_config",
    "public_booking_config",
    "patient_identity_exception_check",
    "patient_booking_history",
    "patient_product_analytics",
    "patient_ui_config",
    "patient_calendar_timezone",
    "patient_content_catalog",
    "patient_diary",
  ] as const)("preserves the %s operation family through an async pool query failure", async (family) => {
    const rlsError = Object.assign(new Error("new row violates row-level security policy for table projected"), {
      code: "42501",
    });
    const { factory } = createFakePoolFactory(async (sql: string) => {
      if (sql === "SELECT projected_config") throw rlsError;
      return { rows: [], rowCount: 0 };
    });
    const pool = createWebappPoolProvider({
      connectionString: "postgres://legacy/db",
      poolFactory: factory,
    });

    await expect(runWithWebappDbOperationFamily(family, () => pool.query("SELECT projected_config"))).rejects.toBe(
      rlsError,
    );

    expect(reportSaasIsolationEventBestEffortMock).toHaveBeenCalledWith({
      eventClass: "rls_denial",
      sourceService: "webapp",
      sourceOperation: family,
    });
  });

  it("classifies an injected signed-principal install failure", async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    const installError = new Error("signature rejected");
    const { factory } = createFakePoolFactory(async (sql: string) => {
      if (sql.includes("app.install_signed_context")) throw installError;
      if (sql === "SELECT pg_backend_pid() AS backend_pid") {
        return { rows: [{ backend_pid: 777 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const pool = createWebappPoolProvider({
      connectionString: "postgres://legacy/db",
      poolFactory: factory,
    });

    await expect(
      runWithWebappDbOperationFamily("patient_runtime_config", () =>
        runWithDbStaffPrincipal({ organizationId: ORG_ID, platformUserId: STAFF_USER_ID }, () =>
          pool.query("SELECT tenant_data"),
        ),
      ),
    ).rejects.toBe(installError);

    expect(reportSaasIsolationEventBestEffortMock).toHaveBeenCalledWith({
      eventClass: "invalid_signature_or_install",
      sourceService: "webapp",
      sourceOperation: "patient_runtime_config",
    });
  });
});
