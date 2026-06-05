/**
 * Opt-in read-only smoke: intake list/get via `runWebappPgText` executor (no writes).
 *
 *   USE_REAL_DATABASE=1 RUN_ONLINE_INTAKE_DEV_DB=1 pnpm exec vitest run src/infra/repos/pgOnlineIntake.devDb.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createPgOnlineIntakePort } from "@/infra/repos/pgOnlineIntake";

async function assertDevDb(client: pg.PoolClient): Promise<void> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(n) || n === "bcb_webapp_dev";
  if (!ok) {
    throw new Error(`refusing: current_database="${n}" — expected dev DB`);
  }
}

const enabled =
  process.env.RUN_ONLINE_INTAKE_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("pgOnlineIntake (dev DB, opt-in read-only)", () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  afterAll(async () => {
    await pool.end();
  });

  it("listRequests runs COUNT/SELECT executor without mutating data", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const port = createPgOnlineIntakePort();
    const result = await port.listRequests({ limit: 1, offset: 0 });
    expect(typeof result.total).toBe("number");
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBeLessThanOrEqual(1);
  });

  it("getById returns null for unknown request id", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const port = createPgOnlineIntakePort();
    const missing = await port.getById("00000000-0000-4000-8000-00000000ffff");
    expect(missing).toBeNull();
  });

  it("getById loads full shape when dev DB has at least one intake request", async () => {
    const client = await pool.connect();
    let requestId: string | undefined;
    try {
      await assertDevDb(client);
      const pick = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM online_intake_requests ORDER BY created_at DESC LIMIT 1`,
      );
      requestId = pick.rows[0]?.id;
    } finally {
      client.release();
    }

    if (!requestId) {
      return;
    }

    const port = createPgOnlineIntakePort();
    const full = await port.getById(requestId);
    expect(full?.id).toBe(requestId);
    expect(Array.isArray(full?.answers)).toBe(true);
    expect(Array.isArray(full?.attachments)).toBe(true);
    expect(Array.isArray(full?.statusHistory)).toBe(true);
  });
});
