/**
 * Opt-in read-only smoke: load purge row shape via executor (no DELETE).
 *
 *   USE_REAL_DATABASE=1 RUN_PURGE_DEV_DB=1 pnpm exec vitest run src/infra/platformUserFullPurge.devDb.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { getPurgePlatformUserRowForTests } from "@/infra/platformUserFullPurge";

async function assertDevDb(client: pg.PoolClient): Promise<void> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(n) || n === "bcb_webapp_dev";
  if (!ok) {
    throw new Error(`refusing: current_database="${n}" — expected dev DB`);
  }
}

const enabled =
  process.env.RUN_PURGE_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("platformUserFullPurge (dev DB, opt-in read-only)", () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  afterAll(async () => {
    await pool.end();
  });

  it("getPurgePlatformUserRowForTests returns null for unknown user id", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }
    const row = await getPurgePlatformUserRowForTests("00000000-0000-4000-8000-00000000ffff");
    expect(row).toBeNull();
  });

  it("getPurgePlatformUserRowForTests loads a client row without mutating data", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
      const pick = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM platform_users WHERE role = 'client' LIMIT 1`,
      );
      const id = pick.rows[0]?.id;
      expect(id, "dev DB needs at least one client for purge row smoke").toBeTruthy();
      const row = await getPurgePlatformUserRowForTests(id!);
      expect(row?.id).toBe(id);
      expect(row?.role).toBe("client");
    } finally {
      client.release();
    }
  });
});
