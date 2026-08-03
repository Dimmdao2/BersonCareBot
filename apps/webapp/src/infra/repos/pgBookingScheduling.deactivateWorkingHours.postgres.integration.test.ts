/**
 * Disposable-Postgres proof (Б1/Б3, #1081) — taskdb #821 §7 companion bug regression.
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
 * mocked port) against a real row on the disposable clone and asserts `is_active` actually flips to
 * `false` in the database — the shape of regression a mocked-port route test cannot catch.
 *
 * Migrated off the shared dev DB (was `.devDb.integration.test.ts`, opt-in env flags never set
 * anywhere — never ran in CI). Writes its own throwaway `be_organizations`/`be_working_hours` rows.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import { runWebappPgText } from '@/infra/db/runWebappSql';
import { createPgBookingSchedulingPort } from '@/infra/repos/pgBookingScheduling';
import { createBookingSchedulingService } from '@/modules/booking-scheduling/service';

const ORG_ID = '20000000-0000-4000-8000-000000000001';

describe('deactivateWorkingHours real-UPDATE regression (disposable Postgres)', () => {
  beforeAll(async () => {
    await runWebappPgText(
      `ALTER TABLE be_organizations DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_organizations DISABLE TRIGGER be_organizations_reference_catalog_snapshot;
       ALTER TABLE be_working_hours DISABLE ROW LEVEL SECURITY;`,
    );
    await runWebappPgText(`INSERT INTO be_organizations (id, title) VALUES ($1, 'B3 working hours')`, [
      ORG_ID,
    ]);
  });

  afterAll(async () => {
    await runWebappPgText(
      `ALTER TABLE be_organizations ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_organizations ENABLE TRIGGER be_organizations_reference_catalog_snapshot;
       ALTER TABLE be_working_hours ENABLE ROW LEVEL SECURITY;`,
    );
    await getPool().end();
  });

  it('flips is_active to false in the database via the real service (id, organizationId) order', async () => {
    const inserted = await runWebappPgText<{ id: string }>(
      `INSERT INTO be_working_hours (organization_id, weekday, start_minute, end_minute, is_active)
       VALUES ($1, 1, 540, 600, true)
       RETURNING id::text`,
      [ORG_ID],
    );
    const workingHoursId = inserted.rows[0]?.id;
    if (!workingHoursId) throw new Error('failed to insert fixture be_working_hours row');

    const beforeRow = await runWebappPgText<{ is_active: boolean }>(
      `SELECT is_active FROM be_working_hours WHERE id = $1`,
      [workingHoursId],
    );
    expect(beforeRow.rows[0]?.is_active).toBe(true);

    // The REAL service — same object shape as `deps.bookingScheduling` in the route handlers,
    // same (id, organizationId) call order the DELETE routes now use after the fix.
    const service = createBookingSchedulingService(createPgBookingSchedulingPort());
    await service.deactivateWorkingHours(workingHoursId, ORG_ID);

    const afterRow = await runWebappPgText<{ is_active: boolean }>(
      `SELECT is_active FROM be_working_hours WHERE id = $1`,
      [workingHoursId],
    );
    expect(afterRow.rows[0]?.is_active).toBe(false);
  });

  it('demonstrates the ORIGINAL bug shape: swapped args match zero rows (UPDATE 0), row stays active', async () => {
    const inserted = await runWebappPgText<{ id: string }>(
      `INSERT INTO be_working_hours (organization_id, weekday, start_minute, end_minute, is_active)
       VALUES ($1, 2, 540, 600, true)
       RETURNING id::text`,
      [ORG_ID],
    );
    const workingHoursId = inserted.rows[0]?.id;
    if (!workingHoursId) throw new Error('failed to insert fixture be_working_hours row');

    const service = createBookingSchedulingService(createPgBookingSchedulingPort());
    // The PRE-FIX call order the routes used to have: (organizationId, id) instead of (id, organizationId).
    await service.deactivateWorkingHours(ORG_ID, workingHoursId);

    const afterRow = await runWebappPgText<{ is_active: boolean }>(
      `SELECT is_active FROM be_working_hours WHERE id = $1`,
      [workingHoursId],
    );
    // Proves the bug's silent-no-op shape: no error, but the row was never touched.
    expect(afterRow.rows[0]?.is_active).toBe(true);
  });
});
