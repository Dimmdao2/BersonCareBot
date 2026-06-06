/**
 * Opt-in read-only smoke: user projection via `runWebappPgText` executor.
 *
 *   USE_REAL_DATABASE=1 RUN_USER_PROJECTION_DEV_DB=1 pnpm exec vitest run src/infra/repos/pgUserProjection.devDb.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { pgUserProjectionPort } from "@/infra/repos/pgUserProjection";

async function assertDevDb(client: pg.PoolClient): Promise<void> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(n) || n === "bcb_webapp_dev";
  if (!ok) {
    throw new Error(`refusing: current_database="${n}" — expected dev DB`);
  }
}

const enabled =
  process.env.RUN_USER_PROJECTION_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("pgUserProjection (dev DB, opt-in read-only)", () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  afterAll(async () => {
    await pool.end();
  });

  it("findByPhoneNormalized returns null for unknown phone", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const row = await pgUserProjectionPort.findByPhoneNormalized("+70000000000");
    expect(row).toBeNull();
  });

  it("getProfileEmailFields returns nulls for unknown user id", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const fields = await pgUserProjectionPort.getProfileEmailFields(
      "00000000-0000-4000-8000-00000000ffff",
    );
    expect(fields).toEqual({ email: null, emailVerifiedAt: null });
  });

  it("clearStaffAccountEmail is no-op for unknown staff id", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const result = await pgUserProjectionPort.clearStaffAccountEmail(
      "00000000-0000-4000-8000-00000000ffff",
    );
    expect(result).toEqual({ ok: false, reason: "not_found_or_not_staff" });
  });
});
