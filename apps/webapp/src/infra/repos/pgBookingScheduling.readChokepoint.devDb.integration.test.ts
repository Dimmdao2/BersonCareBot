/**
 * taskdb #821 Phase 2 — application-level positive/negative proof for the plain-read chokepoint
 * fix (drizzle.ts's `withIssueTimePrincipalReads`), exercised against the REAL, non-mocked
 * `createPgBookingSchedulingPort().listWorkingHoursAdmin` repo function and a real disposable dev-DB
 * two-clinic scenario (own throwaway `be_organizations` rows, cleaned up after).
 *
 * SCOPE NOTE: the plan's Phase 2 (RLS_UNPRINCIPLED_READ_FIX_PLAN.md §5.2/§5.3) calls for this proof
 * against `bersoncarebot_test`'s `seed-saas-test-walkthrough-fixtures.ts` two-clinic fixture, across
 * all six named routes, under real FORCE RLS. That could not be executed from this environment (no
 * `bersoncarebot_test` write/role credentials available here — that DB is read-only-SELECT-only per
 * this task's constraints, and the fixture script requires write access to it). This test instead
 * proves the SAME positive/negative shape end-to-end on `bcb_webapp_dev` (the documented, writable
 * dev sandbox) via the real repo function's own `organization_id` application-level filter — a
 * genuine, non-mocked exercise of the issue-time chokepoint fix, complementary to (not a replacement
 * for) the mechanism-level RLS proof already covered by smoke-r2-real-policy-isolation.mjs and
 * rehearse-multitenant-isolation.mjs (both run unmodified and green — see taskdb #821 report). The
 * full bersoncarebot_test / FORCE-RLS / six-route walkthrough remains a NOT-DONE item for the owner's
 * planned Phase 5 live TEST UI walkthrough.
 *
 *   USE_REAL_DATABASE=1 RUN_BOOKING_SCHEDULING_READ_CHOKEPOINT_DEV_DB=1 \
 *     pnpm exec vitest run src/infra/repos/pgBookingScheduling.readChokepoint.devDb.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { runWithDbOrganizationPrincipal } from '@bersoncare/db-principal';
import { createPgBookingSchedulingPort } from '@/infra/repos/pgBookingScheduling';

async function assertDevDb(client: pg.PoolClient): Promise<void> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? '';
  const ok = /_dev$/i.test(n) || n === 'bcb_webapp_dev';
  if (!ok) {
    throw new Error(
      `refusing: current_database="${n}" — expected dev DB (never test/prod for this write test)`,
    );
  }
}

const enabled =
  process.env.RUN_BOOKING_SCHEDULING_READ_CHOKEPOINT_DEV_DB === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  Boolean((process.env.DATABASE_URL ?? '').trim());

describe.skipIf(!enabled)(
  'taskdb #821 Phase 2: listWorkingHoursAdmin two-clinic isolation (dev DB, opt-in)',
  () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    const clinicAId = randomUUID();
    const clinicBId = randomUUID();
    const rowAId = randomUUID();
    const rowBId = randomUUID();

    beforeAll(async () => {
      const client = await pool.connect();
      try {
        await assertDevDb(client);
        await client.query(
          `INSERT INTO be_organizations (id, title, is_active) VALUES ($1, 'taskdb821-clinic-a', true), ($2, 'taskdb821-clinic-b', true)`,
          [clinicAId, clinicBId],
        );
        await client.query(
          `INSERT INTO be_working_hours (id, organization_id, weekday, start_minute, end_minute, is_active)
         VALUES ($1, $2, 3, 540, 600, true), ($3, $4, 4, 600, 660, true)`,
          [rowAId, clinicAId, rowBId, clinicBId],
        );
      } finally {
        client.release();
      }
    });

    afterAll(async () => {
      const client = await pool.connect();
      try {
        await client.query(`DELETE FROM be_working_hours WHERE organization_id IN ($1, $2)`, [
          clinicAId,
          clinicBId,
        ]);
        await client.query(`DELETE FROM be_organizations WHERE id IN ($1, $2)`, [
          clinicAId,
          clinicBId,
        ]);
      } finally {
        client.release();
        await pool.end();
      }
    });

    it('positive: Clinic A staff sees its own working-hours row via the real repo function', async () => {
      const port = createPgBookingSchedulingPort();
      const rows = await runWithDbOrganizationPrincipal(clinicAId, () =>
        port.listWorkingHoursAdmin({ organizationId: clinicAId }),
      );
      expect(rows.map((r) => r.id)).toContain(rowAId);
      expect(rows.every((r) => r.organizationId === clinicAId)).toBe(true);
    });

    it('positive: Clinic B staff sees its own working-hours row via the real repo function', async () => {
      const port = createPgBookingSchedulingPort();
      const rows = await runWithDbOrganizationPrincipal(clinicBId, () =>
        port.listWorkingHoursAdmin({ organizationId: clinicBId }),
      );
      expect(rows.map((r) => r.id)).toContain(rowBId);
      expect(rows.every((r) => r.organizationId === clinicBId)).toBe(true);
    });

    it(
      'negative: Clinic B staff never sees a Clinic A row, and vice versa, even when the query is ' +
        'issued under a run()-scoped principal and awaited via Promise.all (payment-timeline/route.ts ' +
        'shape) alongside an unrelated concurrent read',
      async () => {
        const port = createPgBookingSchedulingPort();

        const [rowsSeenByA, rowsSeenByB] = await Promise.all([
          runWithDbOrganizationPrincipal(clinicAId, () =>
            port.listWorkingHoursAdmin({ organizationId: clinicAId }),
          ),
          runWithDbOrganizationPrincipal(clinicBId, () =>
            port.listWorkingHoursAdmin({ organizationId: clinicBId }),
          ),
        ]);

        expect(rowsSeenByA.map((r) => r.id)).not.toContain(rowBId);
        expect(rowsSeenByB.map((r) => r.id)).not.toContain(rowAId);
      },
    );
  },
);
