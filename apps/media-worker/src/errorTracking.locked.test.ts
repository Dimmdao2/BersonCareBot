import { getCurrentDbPrincipal } from "@bersoncare/db-principal";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { initMock, order } = vi.hoisted(() => ({
  initMock: vi.fn(),
  order: [] as string[],
}));

vi.mock("@bersoncare/error-tracking", () => ({
  captureErrorTrackingException: vi.fn(),
  closeErrorTracking: vi.fn(async () => true),
  initErrorTracking: initMock,
}));

import { runMediaWorkerStartupGate } from "./errorTracking.js";
import { createMediaWorkerPoolProvider } from "./poolProvider.js";

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe("media-worker error tracking locked startup", () => {
  const originalContextMode = process.env.DB_PRINCIPAL_CONTEXT_MODE;
  const originalSigningSecret = process.env.DB_PRINCIPAL_SIGNING_SECRET;

  beforeEach(() => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";
    order.length = 0;
    initMock.mockReset().mockImplementation(async () => {
      order.push("tracker_initialized");
      return { enabled: true, release: "test" };
    });
  });

  afterEach(() => {
    restoreEnvValue("DB_PRINCIPAL_CONTEXT_MODE", originalContextMode);
    restoreEnvValue("DB_PRINCIPAL_SIGNING_SECRET", originalSigningSecret);
    vi.restoreAllMocks();
  });

  it("runs both config reads, tracker init, and readiness inside the allowed locked principal", async () => {
    const principalContexts: string[] = [];
    const executedSql: string[] = [];
    let releaseCount = 0;
    let backendPid = 7_000;

    vi.spyOn(Pool.prototype, "connect").mockImplementation(async () => {
      const principal = getCurrentDbPrincipal();
      principalContexts.push(`${principal?.kind ?? "missing"}:${principal?.source ?? "missing"}`);
      const client = {
        query: vi.fn(async (sql: string, values?: readonly unknown[]) => {
          executedSql.push(sql);
          if (sql === "SELECT pg_backend_pid() AS backend_pid") {
            backendPid += 1;
            return { rows: [{ backend_pid: backendPid }], rowCount: 1 };
          }
          if (sql.includes("app.read_media_worker_runtime_setting")) {
            const key = String(values?.[0] ?? "");
            order.push(`config:${key}`);
            const value = key === "error_tracking_enabled"
              ? true
              : "https://public@example.test/1";
            return { rows: [{ value_json: { value } }], rowCount: 1 };
          }
          if (sql === "SELECT startup_ready") {
            order.push("readiness");
          }
          return { rows: [], rowCount: 0 };
        }),
        release: vi.fn(() => {
          releaseCount += 1;
        }),
      };
      return client as never;
    });
    vi.spyOn(Pool.prototype, "end").mockResolvedValue(undefined);
    const pool = createMediaWorkerPoolProvider({ connectionString: "postgres://example/test" });

    await runMediaWorkerStartupGate(pool, async () => {
      await pool.query("SELECT startup_ready");
    });
    await pool.end();

    const initIndex = order.indexOf("tracker_initialized");
    const readinessIndex = order.indexOf("readiness");
    const configEntries = order.filter((entry) => entry.startsWith("config:"));
    expect(configEntries).toEqual(expect.arrayContaining([
      "config:error_tracking_enabled",
      "config:error_tracking_dsn",
    ]));
    expect(configEntries).toHaveLength(2);
    expect(order.findIndex((entry) => entry === "config:error_tracking_enabled")).toBeLessThan(initIndex);
    expect(order.findIndex((entry) => entry === "config:error_tracking_dsn")).toBeLessThan(initIndex);
    expect(initIndex).toBeGreaterThanOrEqual(0);
    expect(readinessIndex).toBeGreaterThan(initIndex);
    expect(initMock).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      dsn: "https://public@example.test/1",
      processRole: "media-worker",
    }));
    expect(principalContexts).toEqual([
      "infra:media-worker:tick",
      "infra:media-worker:tick",
      "infra:media-worker:tick",
    ]);
    expect(executedSql.filter((sql) => sql === "SET ROLE app_operational_media_worker")).toHaveLength(3);
    expect(releaseCount).toBe(3);
  });
});
