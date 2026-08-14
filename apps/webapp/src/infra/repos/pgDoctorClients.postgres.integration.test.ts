/**
 * Disposable-Postgres proof (Б1/Б3, #1081): doctor clients port via `createPgDoctorClientsPort`
 * exercising real SQL, not a mock.
 *
 * Migrated off the shared dev DB (was `.devDb.integration.test.ts`, opt-in env flags never set
 * anywhere — never ran in CI). The original only checked return-type shape on whatever ambient
 * data happened to exist; this version seeds a real client fixture so the counts/list are proven
 * against a known value, not just "didn't throw".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import { createPgDoctorClientsPort } from '@/infra/repos/pgDoctorClients';

const ORGANIZATION_ID = '41000000-0000-4000-8000-000000000001';
const SPECIALIST_ID = '41000000-0000-4000-8000-000000000002';
const OTHER_SPECIALIST_ID = '41000000-0000-4000-8000-000000000003';
let clientId: string;

describe('pgDoctorClients (disposable Postgres)', () => {
  beforeAll(async () => {
    const client = await getPool().connect();
    try {
      await client.query('ALTER TABLE platform_users DISABLE ROW LEVEL SECURITY');
      await client.query('ALTER TABLE be_organizations DISABLE ROW LEVEL SECURITY');
      await client.query(
        'ALTER TABLE be_organizations DISABLE TRIGGER be_organizations_reference_catalog_snapshot',
      );
      await client.query('ALTER TABLE org_enrollments DISABLE ROW LEVEL SECURITY');
      await client.query('ALTER TABLE be_specialists DISABLE ROW LEVEL SECURITY');
      await client.query('ALTER TABLE patient_specialist_links DISABLE ROW LEVEL SECURITY');
      await client.query(
        `INSERT INTO be_organizations (id, title)
         VALUES ($1::uuid, 'Doctor clients isolation')`,
        [ORGANIZATION_ID],
      );
      await client.query(
        `INSERT INTO be_specialists (id, organization_id, full_name, is_active)
         VALUES ($1::uuid, $3::uuid, 'Assigned specialist', true),
                ($2::uuid, $3::uuid, 'Other specialist', true)`,
        [SPECIALIST_ID, OTHER_SPECIALIST_ID, ORGANIZATION_ID],
      );
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO platform_users (display_name, role) VALUES ($1, 'client') RETURNING id`,
        ['B3 doctor-clients fixture'],
      );
      clientId = inserted.rows[0]!.id;
      await client.query(
        `INSERT INTO org_enrollments (organization_id, platform_user_id, status)
         VALUES ($1::uuid, $2::uuid, 'active')`,
        [ORGANIZATION_ID, clientId],
      );
      await client.query(
        `INSERT INTO patient_specialist_links
           (organization_id, patient_user_id, specialist_id, status, created_via)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'active', 'manual_assign')`,
        [ORGANIZATION_ID, clientId, SPECIALIST_ID],
      );
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await getPool().end();
  });

  it('listClients returns the real fixture client', async () => {
    const port = createPgDoctorClientsPort();
    const list = await port.listClients({});
    expect(list.some((c) => c.userId === clientId)).toBe(true);
  });

  it('getDashboardPatientMetrics counts the real fixture client', async () => {
    const port = createPgDoctorClientsPort();
    const metrics = await port.getDashboardPatientMetrics();
    expect(metrics.totalClients).toBeGreaterThanOrEqual(1);
    expect(typeof metrics.onSupportCount).toBe('number');
    expect(typeof metrics.visitedThisCalendarMonthCount).toBe('number');
  });

  it('isolates lists and dashboard metrics between specialists in one organization', async () => {
    const port = createPgDoctorClientsPort();
    const assignedActor = {
      membershipRole: 'doctor' as const,
      specialistId: SPECIALIST_ID,
      canManageAllSpecialists: false,
    };
    const otherActor = {
      membershipRole: 'doctor' as const,
      specialistId: OTHER_SPECIALIST_ID,
      canManageAllSpecialists: false,
    };

    const assignedList = await port.listClients({
      organizationId: ORGANIZATION_ID,
      visibilityActor: assignedActor,
    });
    const otherList = await port.listClients({
      organizationId: ORGANIZATION_ID,
      visibilityActor: otherActor,
    });
    expect(assignedList.map((client) => client.userId)).toContain(clientId);
    expect(otherList.map((client) => client.userId)).not.toContain(clientId);

    await expect(
      port.getDashboardPatientMetrics({
        organizationId: ORGANIZATION_ID,
        visibilityActor: assignedActor,
      }),
    ).resolves.toMatchObject({ totalClients: 1 });
    await expect(
      port.getDashboardPatientMetrics({
        organizationId: ORGANIZATION_ID,
        visibilityActor: otherActor,
      }),
    ).resolves.toMatchObject({ totalClients: 0 });
  });
});
