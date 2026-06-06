/**
 * Opt-in read-only smoke: admin audit log via `runWebappPgText` executor.
 *
 *   USE_REAL_DATABASE=1 RUN_ADMIN_AUDIT_LOG_DEV_DB=1 pnpm exec vitest run src/infra/adminAuditLog.devDb.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { countOpenAutoMergeConflicts, listAdminAuditLog } from "@/infra/adminAuditLog";

async function assertDevDb(client: pg.PoolClient): Promise<void> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(n) || n === "bcb_webapp_dev";
  if (!ok) {
    throw new Error(`refusing: current_database="${n}" — expected dev DB`);
  }
}

const enabled =
  process.env.RUN_ADMIN_AUDIT_LOG_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("adminAuditLog (dev DB, opt-in read-only)", () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  afterAll(async () => {
    await pool.end();
  });

  it("listAdminAuditLog returns empty page for impossible action filter", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const page = await listAdminAuditLog(pool, {
      page: 1,
      limit: 5,
      action: "__no_such_audit_action_for_smoke__",
    });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  it("countOpenAutoMergeConflicts returns a number", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const n = await countOpenAutoMergeConflicts(pool);
    expect(typeof n).toBe("number");
    expect(n).toBeGreaterThanOrEqual(0);
  });
});
