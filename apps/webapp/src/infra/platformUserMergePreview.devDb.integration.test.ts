/**
 * Opt-in read-only smoke: `buildMergePreview` against dev DB (no writes).
 *
 *   USE_REAL_DATABASE=1 RUN_MERGE_PREVIEW_DEV_DB=1 pnpm exec vitest run src/infra/platformUserMergePreview.devDb.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import {
  buildMergePreview,
  searchMergeUsersForManualMerge,
} from "@/infra/platformUserMergePreview";

async function assertDevDb(client: pg.PoolClient): Promise<void> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(n) || n === "bcb_webapp_dev";
  if (!ok) {
    throw new Error(`refusing: current_database="${n}" — expected dev DB`);
  }
}

const enabled =
  process.env.RUN_MERGE_PREVIEW_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("platformUserMergePreview (dev DB, opt-in read-only)", () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  afterAll(async () => {
    await pool.end();
  });

  it("searchMergeUsersForManualMerge returns [] for empty query without DB hit", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }
    const rows = await searchMergeUsersForManualMerge(pool, "   ", 10);
    expect(rows).toEqual([]);
  });

  it("searchMergeUsersForManualMerge runs read-only SELECT when query is non-empty", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
      const pick = await client.query<{ phone: string | null }>(
        `SELECT phone_normalized AS phone FROM platform_users
         WHERE role = 'client' AND merged_into_id IS NULL AND phone_normalized IS NOT NULL
         LIMIT 1`,
      );
      const phone = pick.rows[0]?.phone?.trim();
      if (!phone) {
        return;
      }
      const suffix = phone.slice(-4);
      const rows = await searchMergeUsersForManualMerge(pool, suffix, 5);
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThanOrEqual(5);
    } finally {
      client.release();
    }
  });

  it("buildMergePreview returns same_id without touching DB writes", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
      const row = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM platform_users WHERE role = 'client' AND merged_into_id IS NULL LIMIT 1`,
      );
      const id = row.rows[0]?.id;
      expect(id, "dev DB needs at least one canonical client for merge-preview smoke").toBeTruthy();
      const preview = await buildMergePreview(pool, id!, id!);
      expect(preview.ok).toBe(false);
      if (preview.ok) throw new Error("expected same_id");
      expect(preview.error).toBe("same_id");
    } finally {
      client.release();
    }
  });
});
