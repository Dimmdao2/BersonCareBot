/** @vitest-environment node */

import type { Pool, PoolClient } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createWebappPoolProvider: vi.fn(),
}));

vi.mock("@/infra/db/webappPoolProvider", () => ({
  createWebappPoolProvider: mocks.createWebappPoolProvider,
}));

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe("checkDbHealth", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalDbPrincipalContextMode = process.env.DB_PRINCIPAL_CONTEXT_MODE;
  const originalDbPrincipalSigningSecret = process.env.DB_PRINCIPAL_SIGNING_SECRET;

  afterEach(() => {
    restoreEnvValue("DATABASE_URL", originalDatabaseUrl);
    restoreEnvValue("DB_PRINCIPAL_CONTEXT_MODE", originalDbPrincipalContextMode);
    restoreEnvValue("DB_PRINCIPAL_SIGNING_SECRET", originalDbPrincipalSigningSecret);
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses a locked-mode bootstrap DB probe instead of the forbidden infra request-pool principal", async () => {
    process.env.DATABASE_URL = "postgres://webapp-runtime/test";
    process.env.DB_PRINCIPAL_CONTEXT_MODE = "locked";
    process.env.DB_PRINCIPAL_SIGNING_SECRET = "test-db-principal-signing-secret";

    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client as unknown as PoolClient) };
    mocks.createWebappPoolProvider.mockReturnValue(pool as unknown as Pool);

    const { checkDbHealth } = await import("@/infra/db/client");

    await expect(checkDbHealth()).resolves.toBe(true);

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith("select 1");
    expect(query).not.toHaveBeenCalledWith("SET ROLE app_staff");
    expect(query).not.toHaveBeenCalledWith("SET ROLE app_patient");
    expect(release).toHaveBeenCalledTimes(1);
  });
});
