import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  runWebappSql: vi.fn(),
}));

vi.mock('@/infra/db/client', () => ({ getPool: vi.fn() }));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: vi.fn() }));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(),
  runWebappTransaction: vi.fn(),
  runWebappSql: fakes.runWebappSql,
}));
vi.mock('@/infra/repos/pgCanonicalPlatformUser', () => ({
  resolveCanonicalUserId: vi.fn(async (_db: unknown, userId: string) => userId),
}));

import { drizzleSqlFragmentToPgQuery } from '@/infra/db/drizzleSqlDebugText';
import { createPgDoctorClientsPort } from './pgDoctorClients';

const PATIENT_ID = '00000000-0000-4000-8000-000000000001';
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000002';
const APPOINTMENT_ID = '00000000-0000-4000-8000-000000000003';

const fakeCatalog = new Set([
  'be_appointments',
  'be_branches',
  'be_clinic_services',
  'be_package_usages',
  'be_patient_packages',
  'clinical_visit',
]);

function executeAgainstFakeCatalog(_db: unknown, fragment: SQL) {
  const statement = drizzleSqlFragmentToPgQuery(fragment).sql;
  const referencedRelations = Array.from(
    statement.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)/gi),
    (match) => match[1].toLowerCase(),
  );
  const missingRelation = referencedRelations.find((relation) => !fakeCatalog.has(relation));
  if (missingRelation) {
    throw Object.assign(new Error(`relation "${missingRelation}" does not exist`), { code: '42P01' });
  }

  return {
    rows: [
      {
        internal_id: APPOINTMENT_ID,
        id: APPOINTMENT_ID,
        record_at: '2099-08-20T10:00:00.000Z',
        status: 'created',
        service_title: 'Консультация',
        duration_minutes: 60,
        branch_name: 'Главный филиал',
        is_package: false,
        patient_package_id: null,
        package_title: null,
        package_display_number: null,
        has_visit_record: true,
      },
    ],
  };
}

describe('pgDoctorClients.listPatientAppointments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.runWebappSql.mockImplementation(executeAgainstFakeCatalog);
  });

  it('returns appointments when the repository query is executed against the canonical relation catalog', async () => {
    await expect(
      createPgDoctorClientsPort().listPatientAppointments(PATIENT_ID, ORGANIZATION_ID),
    ).resolves.toEqual([
      expect.objectContaining({
        id: APPOINTMENT_ID,
        status: 'upcoming',
        hasVisitRecord: true,
      }),
    ]);
  });

  it('preserves the canonical late-cancellation marker for patient-card summaries', async () => {
    fakes.runWebappSql.mockImplementation((_db: unknown, fragment: SQL) => {
      const result = executeAgainstFakeCatalog(_db, fragment);
      return {
        rows: result.rows.map((row) => ({ ...row, status: 'late_cancellation' })),
      };
    });

    await expect(
      createPgDoctorClientsPort().listPatientAppointments(PATIENT_ID, ORGANIZATION_ID),
    ).resolves.toEqual([
      expect.objectContaining({
        status: 'canceled',
        isLateCancellation: true,
      }),
    ]);
  });
});
