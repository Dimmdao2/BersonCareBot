/**
 * Disposable-Postgres proof (Б1/Б3, #1081) — taskdb #821 Phase 2, application-level
 * positive/negative proof for the plain-read chokepoint fix (drizzle.ts's
 * `withIssueTimePrincipalReads`), exercised against the REAL, non-mocked
 * `createPgBookingSchedulingPort().listWorkingHoursAdmin` repo function and a two-clinic scenario.
 *
 * SCOPE NOTE: proves the repo function's own `organization_id` application-level filter under a
 * real principal-context switch — complementary to (not a replacement for) the mechanism-level RLS
 * proof already covered elsewhere (`smoke-r2-real-policy-isolation.mjs`,
 * `rehearse-multitenant-isolation.mjs`).
 *
 * Migrated off the shared dev DB (was `.devDb.integration.test.ts`, opt-in env flags never set
 * anywhere — never ran in CI). Writes its own throwaway `be_organizations`/`be_working_hours` rows.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { runWithDbOrganizationPrincipal } from '@bersoncare/db-principal';
import { getPool } from '@/infra/db/client';
import { runWebappPgText } from '@/infra/db/runWebappSql';
import { createPgBookingSchedulingPort } from '@/infra/repos/pgBookingScheduling';

describe('taskdb #821 Phase 2: listWorkingHoursAdmin two-clinic isolation (disposable Postgres)', () => {
  const clinicAId = randomUUID();
  const clinicBId = randomUUID();
  const rowAId = randomUUID();
  const rowBId = randomUUID();

  beforeAll(async () => {
    await runWebappPgText(
      `ALTER TABLE be_organizations DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_organizations DISABLE TRIGGER be_organizations_reference_catalog_snapshot;
       ALTER TABLE be_working_hours DISABLE ROW LEVEL SECURITY;`,
    );
    await runWebappPgText(
      `INSERT INTO be_organizations (id, title, is_active) VALUES ($1, 'taskdb821-clinic-a', true), ($2, 'taskdb821-clinic-b', true)`,
      [clinicAId, clinicBId],
    );
    await runWebappPgText(
      `INSERT INTO be_working_hours (id, organization_id, weekday, start_minute, end_minute, is_active)
       VALUES ($1, $2, 3, 540, 600, true), ($3, $4, 4, 600, 660, true)`,
      [rowAId, clinicAId, rowBId, clinicBId],
    );
  });

  afterAll(async () => {
    await runWebappPgText(
      `ALTER TABLE be_organizations ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_organizations ENABLE TRIGGER be_organizations_reference_catalog_snapshot;
       ALTER TABLE be_working_hours ENABLE ROW LEVEL SECURITY;`,
    );
    await getPool().end();
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
});
