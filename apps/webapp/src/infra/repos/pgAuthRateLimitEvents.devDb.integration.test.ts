/**
 * Opt-in smoke against real dev DB: sliding-window rate limit records rows in `auth_rate_limit_events`.
 * Not run in CI by default.
 *
 * From apps/webapp:
 *   USE_REAL_DATABASE=1 RUN_PG_AUTH_RATE_LIMIT_DEV_DB=1 pnpm exec vitest run src/infra/repos/pgAuthRateLimitEvents.devDb.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { checkAndRecordAuthRateLimitEvent } from "@/infra/repos/pgAuthRateLimitEvents";

const MARKER_SCOPE = "dev.smoke.auth_rate_limit";
const MARKER_KEY = "dev-smoke-key";

async function assertDevDb(client: pg.PoolClient): Promise<string> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(n) || n === "bcb_webapp_dev";
  if (!ok) {
    throw new Error(`refusing: current_database="${n}" — expected dev DB.`);
  }
  return n;
}

const enabled =
  process.env.RUN_PG_AUTH_RATE_LIMIT_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("pgAuthRateLimitEvents (dev DB, opt-in)", () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query(
        `DELETE FROM auth_rate_limit_events WHERE scope = $1 AND key = $2`,
        [MARKER_SCOPE, MARKER_KEY],
      );
    } finally {
      client.release();
      await pool.end();
    }
  });

  it("records events and enforces maxPerWindow inside a transaction", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM auth_rate_limit_events WHERE scope = $1 AND key = $2`,
        [MARKER_SCOPE, MARKER_KEY],
      );
      await client.query("COMMIT");

      const params = {
        scope: MARKER_SCOPE,
        key: MARKER_KEY,
        windowMs: 3_600_000,
        maxPerWindow: 2,
      };

      expect(await checkAndRecordAuthRateLimitEvent(params)).toBe(false);
      expect(await checkAndRecordAuthRateLimitEvent(params)).toBe(false);
      expect(await checkAndRecordAuthRateLimitEvent(params)).toBe(true);

      const count = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM auth_rate_limit_events WHERE scope = $1 AND key = $2`,
        [MARKER_SCOPE, MARKER_KEY],
      );
      expect(Number.parseInt(count.rows[0]?.c ?? "0", 10)).toBe(2);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
});
