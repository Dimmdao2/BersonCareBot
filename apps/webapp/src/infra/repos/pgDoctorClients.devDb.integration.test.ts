/**
 * Opt-in read-only smoke: doctor clients port via `runWebappPgText` executor.
 *
 *   USE_REAL_DATABASE=1 RUN_DOCTOR_CLIENTS_DEV_DB=1 pnpm exec vitest run src/infra/repos/pgDoctorClients.devDb.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createPgDoctorClientsPort } from "@/infra/repos/pgDoctorClients";

async function assertDevDb(client: pg.PoolClient): Promise<void> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(n) || n === "bcb_webapp_dev";
  if (!ok) {
    throw new Error(`refusing: current_database="${n}" — expected dev DB`);
  }
}

const enabled =
  process.env.RUN_DOCTOR_CLIENTS_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("pgDoctorClients (dev DB, opt-in read-only)", () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  afterAll(async () => {
    await pool.end();
  });

  it("listClients returns an array via runWebappPgText executor", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const port = createPgDoctorClientsPort();
    const list = await port.listClients({});
    expect(Array.isArray(list)).toBe(true);
  });

  it("getDashboardPatientMetrics returns numeric counts", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const port = createPgDoctorClientsPort();
    const metrics = await port.getDashboardPatientMetrics();
    expect(typeof metrics.totalClients).toBe("number");
    expect(typeof metrics.onSupportCount).toBe("number");
    expect(typeof metrics.visitedThisCalendarMonthCount).toBe("number");
  });
});
