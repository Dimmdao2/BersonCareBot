/**
 * S03 migration oracle (#1081). Every case runs the real 0309 SQL against this file's private
 * disposable clone; shared DEV/TEST/PROD databases are never selected by this Vitest project.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const migrationSql = readFileSync(
  new URL('../../../db/drizzle-migrations/0309_v9b_booking_ownership_local.sql', import.meta.url),
  'utf8',
);

const ORG_A = '20000000-0000-4000-8000-000000000001';
const ORG_B = '20000000-0000-4000-8000-000000000002';
const USER_A = '20000000-0000-4000-8000-000000000003';
const USER_B = '20000000-0000-4000-8000-000000000004';
const SPECIALIST_A = '20000000-0000-4000-8000-000000000005';
const SPECIALIST_B = '20000000-0000-4000-8000-000000000006';
const APPOINTMENT_A = '20000000-0000-4000-8000-000000000007';
const APPOINTMENT_B = '20000000-0000-4000-8000-000000000008';
const BOOKING_A = '20000000-0000-4000-8000-000000000009';

type Reason =
  | 'zero_match'
  | 'multiple_match'
  | 'deleted_parent'
  | 'user_mismatch'
  | 'provider_mismatch';

describe('0309 deterministic booking ownership backfill', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  beforeAll(async () => {
    await pool.query(
      `ALTER TABLE be_organizations DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_organizations DISABLE TRIGGER be_organizations_reference_catalog_snapshot;
       ALTER TABLE platform_users DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_specialists DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_appointments DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_external_entity_mappings DISABLE ROW LEVEL SECURITY;
       ALTER TABLE patient_bookings DISABLE ROW LEVEL SECURITY;
       ALTER TABLE appointment_records DISABLE ROW LEVEL SECURITY;`,
    );
  });

  async function resetToPre0309(): Promise<void> {
    await pool.query(`DELETE FROM appointment_records`);
    await pool.query(`DELETE FROM patient_bookings`);
    await pool.query(
      `DELETE FROM be_external_entity_mappings
        WHERE canonical_id IN ($1, $2)
           OR (external_system = 'rubitime' AND external_id LIKE 's03-%')`,
      [APPOINTMENT_A, APPOINTMENT_B],
    );
    await pool.query(`DELETE FROM be_appointments WHERE id IN ($1, $2)`, [
      APPOINTMENT_A,
      APPOINTMENT_B,
    ]);
    await pool.query(`DELETE FROM be_specialists WHERE id IN ($1, $2)`, [
      SPECIALIST_A,
      SPECIALIST_B,
    ]);
    await pool.query(`DELETE FROM platform_users WHERE id IN ($1, $2)`, [USER_A, USER_B]);
    await pool.query(`DELETE FROM be_organizations WHERE id IN ($1, $2)`, [ORG_A, ORG_B]);
    await pool.query(
      `ALTER TABLE patient_bookings DROP COLUMN IF EXISTS organization_id;
       ALTER TABLE appointment_records DROP COLUMN IF EXISTS organization_id;`,
    );
  }

  beforeEach(resetToPre0309);

  afterAll(async () => {
    await pool.query(
      `ALTER TABLE be_organizations ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_organizations ENABLE TRIGGER be_organizations_reference_catalog_snapshot;
       ALTER TABLE platform_users ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_specialists ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_appointments ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_external_entity_mappings ENABLE ROW LEVEL SECURITY;
       ALTER TABLE patient_bookings ENABLE ROW LEVEL SECURITY;
       ALTER TABLE appointment_records ENABLE ROW LEVEL SECURITY;`,
    );
    await pool.end();
  });

  async function insertOrganization(id: string): Promise<void> {
    await pool.query(`INSERT INTO be_organizations (id, title) VALUES ($1, $2)`, [id, `S03 ${id}`]);
  }

  async function insertUser(id: string): Promise<void> {
    await pool.query(`INSERT INTO platform_users (id) VALUES ($1)`, [id]);
  }

  async function insertSpecialist(id: string, organizationId: string): Promise<void> {
    await pool.query(
      `INSERT INTO be_specialists (id, organization_id, full_name) VALUES ($1, $2, 'S03 specialist')`,
      [id, organizationId],
    );
  }

  async function insertAppointment(input: {
    id: string;
    organizationId: string;
    userId?: string | null;
    specialistId?: string | null;
    deleted?: boolean;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO be_appointments (
         id, organization_id, platform_user_id, specialist_id, start_at, end_at,
         duration_minutes, source, status, deleted_at
       ) VALUES (
         $1, $2, $3, $4, '2027-03-01T10:00:00Z', '2027-03-01T10:30:00Z',
         30, 'native', 'confirmed', CASE WHEN $5::boolean THEN now() ELSE NULL END
       )`,
      [
        input.id,
        input.organizationId,
        input.userId ?? null,
        input.specialistId ?? null,
        input.deleted ?? false,
      ],
    );
  }

  async function insertBooking(input: {
    id: string;
    appointmentId?: string | null;
    userId?: string | null;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO patient_bookings (
         id, platform_user_id, booking_type, category, slot_start, slot_end, status,
         contact_phone, contact_name, canonical_appointment_id
       ) VALUES (
         $1, $2, 'online', 'general', '2027-03-01T10:00:00Z', '2027-03-01T10:30:00Z',
         'confirmed', '+70000000002', 'S03 fixture', $3
       )`,
      [input.id, input.userId ?? null, input.appointmentId ?? null],
    );
  }

  async function insertRecord(input: {
    integratorRecordId: string;
    payload?: Record<string, unknown>;
    userId?: string | null;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO appointment_records (
         integrator_record_id, platform_user_id, status, payload_json
       ) VALUES ($1, $2, 'created', $3::jsonb)`,
      [input.integratorRecordId, input.userId ?? null, JSON.stringify(input.payload ?? {})],
    );
  }

  async function runMigration(): Promise<Error | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migrationSql);
      await client.query('COMMIT');
      return null;
    } catch (error) {
      await client.query('ROLLBACK');
      return error instanceof Error ? error : new Error(String(error));
    } finally {
      client.release();
    }
  }

  async function expectReason(reason: Reason): Promise<void> {
    const error = await runMigration();
    expect(error).not.toBeNull();
    expect(error?.message).toContain(`${reason}=1`);
    for (const namedReason of [
      'zero_match',
      'multiple_match',
      'deleted_parent',
      'user_mismatch',
      'provider_mismatch',
    ]) {
      expect(error?.message).toContain(`${namedReason}=`);
    }
    const columns = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('patient_bookings', 'appointment_records')
          AND column_name = 'organization_id'`,
    );
    expect(columns.rows[0]?.count).toBe('0');
  }

  it('stamps exact native and retained external-key matches, reaches NOT NULL, and reruns idempotently', async () => {
    await insertOrganization(ORG_A);
    await insertUser(USER_A);
    await insertSpecialist(SPECIALIST_A, ORG_A);
    await insertAppointment({
      id: APPOINTMENT_A,
      organizationId: ORG_A,
      userId: USER_A,
      specialistId: SPECIALIST_A,
    });
    await insertBooking({ id: BOOKING_A, appointmentId: APPOINTMENT_A, userId: USER_A });
    await insertRecord({
      integratorRecordId: `be:${APPOINTMENT_A}`,
      userId: USER_A,
      payload: {
        source: 'native',
        appointment_id: APPOINTMENT_A,
        platform_user_id: USER_A,
        specialist_id: SPECIALIST_A,
      },
    });
    await pool.query(
      `INSERT INTO be_external_entity_mappings (
         id, organization_id, entity_type, canonical_id, external_system, external_id
       ) VALUES
         ('20000000-0000-4000-8000-00000000000b', $1, 'appointment', $2, 'rubitime', 's03-legacy-record'),
         ('20000000-0000-4000-8000-00000000000c', $1, 'specialist', $3, 'rubitime', 's03-provider')`,
      [ORG_A, APPOINTMENT_A, SPECIALIST_A],
    );
    await insertRecord({
      integratorRecordId: 's03-legacy-record',
      userId: USER_A,
      payload: { cooperator_id: 's03-provider' },
    });

    expect(await runMigration()).toBeNull();
    const rows = await pool.query<{ organization_id: string }>(
      `SELECT organization_id FROM patient_bookings WHERE id = $1
       UNION ALL
       SELECT organization_id FROM appointment_records
        WHERE integrator_record_id IN ($2, 's03-legacy-record')
       ORDER BY organization_id`,
      [BOOKING_A, `be:${APPOINTMENT_A}`],
    );
    expect(rows.rows.map((row) => row.organization_id)).toEqual([ORG_A, ORG_A, ORG_A]);

    const nullability = await pool.query<{ table_name: string; is_nullable: string }>(
      `SELECT table_name, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('patient_bookings', 'appointment_records')
          AND column_name = 'organization_id'
        ORDER BY table_name`,
    );
    expect(nullability.rows).toEqual([
      { table_name: 'appointment_records', is_nullable: 'NO' },
      { table_name: 'patient_bookings', is_nullable: 'NO' },
    ]);

    expect(await runMigration()).toBeNull();
    const rerunRows = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM appointment_records
        WHERE organization_id = $1`,
      [ORG_A],
    );
    expect(rerunRows.rows[0]?.count).toBe('2');
  });

  it('classifies zero_match and rolls back a stamp made for a valid sibling row', async () => {
    await insertOrganization(ORG_A);
    await insertUser(USER_A);
    await insertAppointment({ id: APPOINTMENT_A, organizationId: ORG_A, userId: USER_A });
    await insertBooking({ id: BOOKING_A, appointmentId: APPOINTMENT_A, userId: USER_A });
    await insertRecord({ integratorRecordId: 's03-no-parent' });

    await expectReason('zero_match');
    const preserved = await pool.query<{ canonical_appointment_id: string }>(
      `SELECT canonical_appointment_id FROM patient_bookings WHERE id = $1`,
      [BOOKING_A],
    );
    expect(preserved.rows[0]?.canonical_appointment_id).toBe(APPOINTMENT_A);
  });

  it('classifies multiple_match when immutable native identities contradict each other', async () => {
    await insertOrganization(ORG_A);
    await insertOrganization(ORG_B);
    await insertAppointment({ id: APPOINTMENT_A, organizationId: ORG_A });
    await insertAppointment({ id: APPOINTMENT_B, organizationId: ORG_B });
    await insertRecord({
      integratorRecordId: `be:${APPOINTMENT_A}`,
      payload: { source: 'native', appointment_id: APPOINTMENT_B },
    });
    await expectReason('multiple_match');
  });

  it('classifies deleted_parent instead of stamping a soft-deleted canonical row', async () => {
    await insertOrganization(ORG_A);
    await insertUser(USER_A);
    await insertAppointment({
      id: APPOINTMENT_A,
      organizationId: ORG_A,
      userId: USER_A,
      deleted: true,
    });
    await insertBooking({ id: BOOKING_A, appointmentId: APPOINTMENT_A, userId: USER_A });
    await expectReason('deleted_parent');
  });

  it('classifies cross-identity user_mismatch and never stamps the parent organization', async () => {
    await insertOrganization(ORG_B);
    await insertUser(USER_A);
    await insertUser(USER_B);
    await insertAppointment({ id: APPOINTMENT_B, organizationId: ORG_B, userId: USER_B });
    await insertBooking({ id: BOOKING_A, appointmentId: APPOINTMENT_B, userId: USER_A });
    await expectReason('user_mismatch');
  });

  it('classifies cross-organization provider_mismatch and never stamps it', async () => {
    await insertOrganization(ORG_A);
    await insertOrganization(ORG_B);
    await insertSpecialist(SPECIALIST_A, ORG_A);
    await insertSpecialist(SPECIALIST_B, ORG_B);
    await insertAppointment({
      id: APPOINTMENT_A,
      organizationId: ORG_A,
      specialistId: SPECIALIST_A,
    });
    await insertRecord({
      integratorRecordId: `be:${APPOINTMENT_A}`,
      payload: {
        source: 'native',
        appointment_id: APPOINTMENT_A,
        specialist_id: SPECIALIST_B,
      },
    });
    await expectReason('provider_mismatch');
  });

});
