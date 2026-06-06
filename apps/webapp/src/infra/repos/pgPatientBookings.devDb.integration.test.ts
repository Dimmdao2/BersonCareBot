/**
 * Opt-in read-only smoke: patient bookings via `runWebappPgText` executor.
 *
 *   USE_REAL_DATABASE=1 RUN_PATIENT_BOOKINGS_DEV_DB=1 pnpm exec vitest run src/infra/repos/pgPatientBookings.devDb.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { pgPatientBookingsPort } from "@/infra/repos/pgPatientBookings";

async function assertDevDb(client: pg.PoolClient): Promise<void> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(n) || n === "bcb_webapp_dev";
  if (!ok) {
    throw new Error(`refusing: current_database="${n}" — expected dev DB`);
  }
}

const enabled =
  process.env.RUN_PATIENT_BOOKINGS_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("pgPatientBookings (dev DB, opt-in read-only)", () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  afterAll(async () => {
    await pool.end();
  });

  it("getById returns null for unknown booking id", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const row = await pgPatientBookingsPort.getById("00000000-0000-4000-8000-00000000ffff");
    expect(row).toBeNull();
  });

  it("listHistoryByUser returns an array (may be empty)", async () => {
    const client = await pool.connect();
    let userId: string | undefined;
    try {
      await assertDevDb(client);
      const pick = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM platform_users WHERE merged_into_id IS NULL LIMIT 1`,
      );
      userId = pick.rows[0]?.id;
    } finally {
      client.release();
    }

    if (!userId) {
      return;
    }

    const rows = await pgPatientBookingsPort.listHistoryByUser(userId, new Date().toISOString());
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(100);
  });
});
