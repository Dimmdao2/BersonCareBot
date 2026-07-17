/**
 * taskdb #821 §7 — companion bug regression (independent of the RLS chokepoint fix).
 *
 * `deactivateWorkingHours` had its args swapped at the two DELETE route call sites
 * (app/api/admin/booking-engine/working-hours/route.ts:120,
 * app/api/doctor/booking-engine/working-hours/route.ts:182): the service facade's signature is
 * `deactivateWorkingHours(id, organizationId)` (modules/booking-scheduling/service.ts:285), but both
 * routes called `deactivateWorkingHours(gate.ctx.organizationId, id)`. Because both params are
 * `string`, the type checker never caught it, and the existing route unit tests mocked
 * `deps.bookingScheduling.deactivateWorkingHours` and asserted the BUGGY call order as ground truth
 * (fixed alongside this test — see route.test.ts). The effect: the real UPDATE's WHERE clause became
 * `id = <organizationId> AND organization_id = <rowId>`, matching zero rows — `UPDATE 0`, no error,
 * `200 OK`, but the row's `is_active` never actually flips. This test exercises the REAL service (no
 * mocked port), against a real disposable dev-DB row, and asserts `is_active` actually flips to
 * `false` in the database — the shape of regression a mocked-port route test cannot catch.
 *
 * Opt-in, gated, real dev-DB only (never test/prod) — writes ONE throwaway `be_working_hours` row
 * scoped to an existing organization, deactivates it via the real service, asserts the DB row
 * flipped, then deletes the throwaway row:
 *
 *   USE_REAL_DATABASE=1 RUN_DEACTIVATE_WORKING_HOURS_DEV_DB=1 \
 *     pnpm exec vitest run src/infra/repos/pgBookingScheduling.deactivateWorkingHours.devDb.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createPgBookingSchedulingPort } from "@/infra/repos/pgBookingScheduling";
import { createBookingSchedulingService } from "@/modules/booking-scheduling/service";

async function assertDevDb(client: pg.PoolClient): Promise<void> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(n) || n === "bcb_webapp_dev";
  if (!ok) {
    throw new Error(`refusing: current_database="${n}" — expected dev DB (never test/prod for this write test)`);
  }
}

const enabled =
  process.env.RUN_DEACTIVATE_WORKING_HOURS_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("deactivateWorkingHours real-DELETE regression (dev DB, opt-in write)", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

  afterAll(async () => {
    await pool.end();
  });

  it("flips is_active to false in the database via the real service (id, organizationId) order", async () => {
    const client = await pool.connect();
    let organizationId: string | undefined;
    let workingHoursId: string | undefined;
    try {
      await assertDevDb(client);

      const orgRow = await client.query<{ id: string }>(`SELECT id::text FROM be_organizations LIMIT 1`);
      organizationId = orgRow.rows[0]?.id;
      if (!organizationId) {
        throw new Error("no be_organizations row available on this dev DB to scope the throwaway row to");
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO be_working_hours (organization_id, weekday, start_minute, end_minute, is_active)
         VALUES ($1, 1, 540, 600, true)
         RETURNING id::text`,
        [organizationId],
      );
      workingHoursId = inserted.rows[0]?.id;
      if (!workingHoursId) throw new Error("failed to insert throwaway be_working_hours row");

      const beforeRow = await client.query<{ is_active: boolean }>(
        `SELECT is_active FROM be_working_hours WHERE id = $1`,
        [workingHoursId],
      );
      expect(beforeRow.rows[0]?.is_active).toBe(true);

      // The REAL service — same object shape as `deps.bookingScheduling` in the route handlers,
      // same (id, organizationId) call order the DELETE routes now use after the fix.
      const service = createBookingSchedulingService(createPgBookingSchedulingPort());
      await service.deactivateWorkingHours(workingHoursId, organizationId);

      const afterRow = await client.query<{ is_active: boolean }>(
        `SELECT is_active FROM be_working_hours WHERE id = $1`,
        [workingHoursId],
      );
      expect(afterRow.rows[0]?.is_active).toBe(false);
    } finally {
      if (workingHoursId) {
        await client.query(`DELETE FROM be_working_hours WHERE id = $1`, [workingHoursId]);
      }
      client.release();
    }
  });

  it("demonstrates the ORIGINAL bug shape: swapped args match zero rows (UPDATE 0), row stays active", async () => {
    const client = await pool.connect();
    let organizationId: string | undefined;
    let workingHoursId: string | undefined;
    try {
      await assertDevDb(client);

      const orgRow = await client.query<{ id: string }>(`SELECT id::text FROM be_organizations LIMIT 1`);
      organizationId = orgRow.rows[0]?.id;
      if (!organizationId) {
        throw new Error("no be_organizations row available on this dev DB to scope the throwaway row to");
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO be_working_hours (organization_id, weekday, start_minute, end_minute, is_active)
         VALUES ($1, 2, 540, 600, true)
         RETURNING id::text`,
        [organizationId],
      );
      workingHoursId = inserted.rows[0]?.id;
      if (!workingHoursId) throw new Error("failed to insert throwaway be_working_hours row");

      const service = createBookingSchedulingService(createPgBookingSchedulingPort());
      // The PRE-FIX call order the routes used to have: (organizationId, id) instead of (id, organizationId).
      await service.deactivateWorkingHours(organizationId, workingHoursId);

      const afterRow = await client.query<{ is_active: boolean }>(
        `SELECT is_active FROM be_working_hours WHERE id = $1`,
        [workingHoursId],
      );
      // Proves the bug's silent-no-op shape: no error, but the row was never touched.
      expect(afterRow.rows[0]?.is_active).toBe(true);
    } finally {
      if (workingHoursId) {
        await client.query(`DELETE FROM be_working_hours WHERE id = $1`, [workingHoursId]);
      }
      client.release();
    }
  });
});
