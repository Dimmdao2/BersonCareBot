/**
 * Opt-in read-only smoke: doctor analytics metric accounts via `runWebappPgText`.
 *
 *   USE_REAL_DATABASE=1 RUN_DOCTOR_ANALYTICS_DEV_DB=1 pnpm exec vitest run src/infra/repos/pgDoctorAnalyticsMetricAccounts.devDb.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createPgDoctorAnalyticsMetricAccountsPort } from "@/infra/repos/pgDoctorAnalyticsMetricAccounts";

async function assertDevDb(client: pg.PoolClient): Promise<void> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(n) || n === "bcb_webapp_dev";
  if (!ok) {
    throw new Error(`refusing: current_database="${n}" — expected dev DB`);
  }
}

const enabled =
  process.env.RUN_DOCTOR_ANALYTICS_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("pgDoctorAnalyticsMetricAccounts (dev DB, opt-in read-only)", () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  afterAll(async () => {
    await pool.end();
  });

  it("listMetricAccounts clients_total returns paginated shape", async () => {
    const client = await pool.connect();
    let orgId: string | undefined;
    try {
      await assertDevDb(client);
      const org = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM organizations ORDER BY created_at ASC NULLS LAST LIMIT 1`,
      );
      orgId = org.rows[0]?.id;
    } finally {
      client.release();
    }

    if (!orgId) return;

    const port = createPgDoctorAnalyticsMetricAccountsPort(async () => orgId!);
    const result = await port.listMetricAccounts({
      metric: "clients_total",
      period: { preset: "week" },
      limit: 5,
      offset: 0,
      iana: "Europe/Moscow",
    });

    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.hasMore).toBe("boolean");
    expect(result.nextOffset === null || typeof result.nextOffset === "number").toBe(true);
  });
});
