/**
 * Opt-in read-only smoke: phase 14D comms tail via `runWebappPgText` executor.
 *
 *   USE_REAL_DATABASE=1 RUN_PHASE_14D_DEV_DB=1 pnpm exec vitest run src/infra/repos/pgPhase14DCommsTail.devDb.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createPgBroadcastAuditPort } from "@/infra/repos/pgBroadcastAudit";
import { createPgSubscriptionMailingProjectionPort } from "@/infra/repos/pgSubscriptionMailingProjection";
import { getPatientCalendarTimezoneIana } from "@/infra/repos/pgPatientCalendarTimezone";

async function assertDevDb(client: pg.PoolClient): Promise<void> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(n) || n === "bcb_webapp_dev";
  if (!ok) {
    throw new Error(`refusing: current_database="${n}" — expected dev DB`);
  }
}

const enabled =
  process.env.RUN_PHASE_14D_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("phase 14D comms tail (dev DB, opt-in read-only)", () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  afterAll(async () => {
    await pool.end();
  });

  it("listTopics returns array", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }
    const topics = await createPgSubscriptionMailingProjectionPort().listTopics();
    expect(Array.isArray(topics)).toBe(true);
  });

  it("broadcast audit list returns array", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }
    const rows = await createPgBroadcastAuditPort().list(5);
    expect(Array.isArray(rows)).toBe(true);
  });

  it("getPatientCalendarTimezoneIana returns null for unknown user", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }
    const tz = await getPatientCalendarTimezoneIana("00000000-0000-4000-8000-00000000ffff");
    expect(tz).toBeNull();
  });
});
