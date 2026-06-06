/**
 * Opt-in read-only smoke: Wave 3 phase 13D ports via `runWebappPgText` / Drizzle executor.
 *
 *   USE_REAL_DATABASE=1 RUN_DOCTOR_PHASE_13D_DEV_DB=1 pnpm exec vitest run src/infra/repos/pgDoctorPhase13d.devDb.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createPgDoctorMotivationQuotesEditorPort } from "@/infra/repos/pgDoctorMotivationQuotesEditor";
import { createPgDoctorProactiveInsightsPort } from "@/infra/repos/pgDoctorProactiveInsights";

async function assertDevDb(client: pg.PoolClient): Promise<void> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(n) || n === "bcb_webapp_dev";
  if (!ok) {
    throw new Error(`refusing: current_database="${n}" — expected dev DB`);
  }
}

const enabled =
  process.env.RUN_DOCTOR_PHASE_13D_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("Wave 3 phase 13D (dev DB, opt-in read-only)", () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  afterAll(async () => {
    await pool.end();
  });

  it("motivation editor listQuotesForEditor returns an array", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const port = createPgDoctorMotivationQuotesEditorPort();
    const rows = await port.listQuotesForEditor();
    expect(Array.isArray(rows)).toBe(true);
  });

  it("proactive insights queryInsights returns paginated shape", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const port = createPgDoctorProactiveInsightsPort();
    const result = await port.queryInsights({ limit: 5, displayIana: "Europe/Moscow" });
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.totalCount).toBe("number");
  });
});
