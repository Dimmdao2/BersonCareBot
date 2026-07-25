/**
 * Opt-in read-only smoke: booking catalog via `runWebappPgText` executor.
 *
 *   USE_REAL_DATABASE=1 RUN_BOOKING_CATALOG_DEV_DB=1 pnpm exec vitest run src/infra/repos/pgBookingCatalog.devDb.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createPgBookingCatalogPort } from "@/infra/repos/pgBookingCatalog";

async function assertDevDb(client: pg.PoolClient): Promise<void> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(n) || n === "bcb_webapp_dev";
  if (!ok) {
    throw new Error(`refusing: current_database="${n}" — expected dev DB`);
  }
}

const enabled =
  process.env.RUN_BOOKING_CATALOG_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("pgBookingCatalog (dev DB, opt-in read-only)", () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  afterAll(async () => {
    await pool.end();
  });

  it("listCitiesAdmin includes inactive rows when present", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const port = createPgBookingCatalogPort();
    const cities = await port.listCitiesAdmin();
    expect(Array.isArray(cities)).toBe(true);
  });

  it("getCityById returns null for unknown id", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const port = createPgBookingCatalogPort();
    const missing = await port.getCityById("00000000-0000-4000-8000-00000000ffff");
    expect(missing).toBeNull();
  });

  it("deactivateCity on unknown id is no-op (rowCount smoke)", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const port = createPgBookingCatalogPort();
    const ok = await port.deactivateCity("00000000-0000-4000-8000-00000000ffff");
    expect(ok).toBe(false);
  });
});
