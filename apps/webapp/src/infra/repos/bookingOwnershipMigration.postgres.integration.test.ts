/**
 * S03 migration oracle (#1081). Every case runs the real 0309 SQL against this file's private
 * disposable clone; shared DEV/TEST/PROD databases are never selected by this Vitest project.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PoolClient } from 'pg';
import { getPool } from '@/infra/db/client';
import { getWebappSqlFromPgClient, runWebappPgText } from '@/infra/db/runWebappSql';

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
  | 'multiple_match'
  | 'user_mismatch'
  | 'provider_mismatch';

function errorMessages(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return `${error.message} ${error.cause === undefined ? '' : errorMessages(error.cause)}`;
}

describe('0309 deterministic booking ownership backfill', () => {
  const pool = getPool();

  async function run<T = unknown>(queryText: string, values: readonly unknown[] = []) {
    return runWebappPgText<T>(queryText, values);
  }

  async function runOnClient<T = unknown>(
    client: PoolClient,
    queryText: string,
    values: readonly unknown[] = [],
  ) {
    return runWebappPgText<T>(queryText, values, getWebappSqlFromPgClient(client));
  }

  beforeAll(async () => {
    await run(
      `ALTER TABLE be_organizations DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_organizations DISABLE TRIGGER be_organizations_reference_catalog_snapshot;
       ALTER TABLE platform_users DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_specialists DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_appointments DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_external_entity_mappings DISABLE ROW LEVEL SECURITY;
       ALTER TABLE org_enrollments DISABLE ROW LEVEL SECURITY;
       ALTER TABLE patient_bookings DISABLE ROW LEVEL SECURITY;
       ALTER TABLE appointment_records DISABLE ROW LEVEL SECURITY;`,
    );
  });

  async function resetToPre0309(): Promise<void> {
    await run(`DELETE FROM app.principal_context WHERE patient_user_id IN ($1, $2)`, [
      USER_A,
      USER_B,
    ]);
    await run(`DELETE FROM appointment_records`);
    await run(`DELETE FROM patient_bookings`);
    await run(`DELETE FROM org_enrollments WHERE platform_user_id IN ($1, $2)`, [
      USER_A,
      USER_B,
    ]);
    await run(
      `DELETE FROM be_external_entity_mappings
        WHERE canonical_id IN ($1, $2)
           OR (external_system = 'rubitime' AND external_id LIKE 's03-%')`,
      [APPOINTMENT_A, APPOINTMENT_B],
    );
    await run(`DELETE FROM be_appointments WHERE id IN ($1, $2)`, [
      APPOINTMENT_A,
      APPOINTMENT_B,
    ]);
    await run(`DELETE FROM be_specialists WHERE id IN ($1, $2)`, [
      SPECIALIST_A,
      SPECIALIST_B,
    ]);
    await run(`DELETE FROM platform_users WHERE id IN ($1, $2)`, [USER_A, USER_B]);
    await run(`DELETE FROM be_organizations WHERE id IN ($1, $2)`, [ORG_A, ORG_B]);
    await run(
      `DROP FUNCTION IF EXISTS app.read_current_patient_booking_rows(text, timestamptz)`,
    );
    await run(
      `ALTER TABLE patient_bookings DROP COLUMN IF EXISTS organization_id;
       ALTER TABLE appointment_records DROP COLUMN IF EXISTS organization_id;`,
    );
  }

  beforeEach(resetToPre0309);

  afterAll(async () => {
    await run(
      `ALTER TABLE be_organizations ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_organizations ENABLE TRIGGER be_organizations_reference_catalog_snapshot;
       ALTER TABLE platform_users ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_specialists ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_appointments ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_external_entity_mappings ENABLE ROW LEVEL SECURITY;
       ALTER TABLE org_enrollments ENABLE ROW LEVEL SECURITY;
       ALTER TABLE patient_bookings ENABLE ROW LEVEL SECURITY;
       ALTER TABLE appointment_records ENABLE ROW LEVEL SECURITY;`,
    );
    await pool.end();
  });

  async function insertOrganization(id: string): Promise<void> {
    await run(`INSERT INTO be_organizations (id, title) VALUES ($1, $2)`, [id, `S03 ${id}`]);
  }

  async function insertUser(id: string): Promise<void> {
    await run(`INSERT INTO platform_users (id) VALUES ($1)`, [id]);
  }

  async function insertSpecialist(id: string, organizationId: string): Promise<void> {
    await run(
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
    await run(
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
    await run(
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
    await run(
      `INSERT INTO appointment_records (
         integrator_record_id, platform_user_id, status, payload_json
       ) VALUES ($1, $2, 'created', $3::jsonb)`,
      [input.integratorRecordId, input.userId ?? null, JSON.stringify(input.payload ?? {})],
    );
  }

  async function runMigration(): Promise<Error | null> {
    const client = await pool.connect();
    try {
      await runOnClient(client, 'BEGIN');
      await runOnClient(client, migrationSql);
      await runOnClient(client, 'COMMIT');
      return null;
    } catch (error) {
      await runOnClient(client, 'ROLLBACK');
      return error instanceof Error ? error : new Error(String(error));
    } finally {
      client.release();
    }
  }

  async function expectReason(reason: Reason): Promise<void> {
    const error = await runMigration();
    expect(error).not.toBeNull();
    const message = errorMessages(error);
    expect(message).toContain(`${reason}=1`);
    for (const namedReason of ['multiple_match', 'user_mismatch', 'provider_mismatch']) {
      expect(message).toContain(`${namedReason}=`);
    }
    const columns = await run<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('patient_bookings', 'appointment_records')
          AND column_name = 'organization_id'`,
    );
    expect(columns.rows[0]?.count).toBe('0');
  }

  it('stamps exact live and soft-deleted canonical parents, keeps nullable columns, and reruns idempotently', async () => {
    await insertOrganization(ORG_A);
    await insertUser(USER_A);
    await insertSpecialist(SPECIALIST_A, ORG_A);
    await insertAppointment({
      id: APPOINTMENT_A,
      organizationId: ORG_A,
      userId: USER_A,
      specialistId: SPECIALIST_A,
    });
    await insertAppointment({
      id: APPOINTMENT_B,
      organizationId: ORG_A,
      userId: USER_A,
      specialistId: SPECIALIST_A,
      deleted: true,
    });
    await insertBooking({ id: BOOKING_A, appointmentId: APPOINTMENT_A, userId: USER_A });
    await insertBooking({
      id: '20000000-0000-4000-8000-00000000000a',
      appointmentId: APPOINTMENT_B,
      userId: USER_A,
    });
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
    await insertRecord({
      integratorRecordId: `be:${APPOINTMENT_B}`,
      userId: USER_A,
      payload: {
        source: 'native',
        appointment_id: APPOINTMENT_B,
        platform_user_id: USER_A,
        specialist_id: SPECIALIST_A,
      },
    });

    expect(await runMigration()).toBeNull();
    const rows = await run<{ organization_id: string }>(
      `SELECT organization_id FROM patient_bookings WHERE id IN ($1, $2)
       UNION ALL
       SELECT organization_id FROM appointment_records
        WHERE integrator_record_id IN ($3, $4)
       ORDER BY organization_id`,
      [BOOKING_A, '20000000-0000-4000-8000-00000000000a', `be:${APPOINTMENT_A}`, `be:${APPOINTMENT_B}`],
    );
    expect(rows.rows.map((row) => row.organization_id)).toEqual([ORG_A, ORG_A, ORG_A, ORG_A]);

    const nullability = await run<{ table_name: string; is_nullable: string }>(
      `SELECT table_name, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('patient_bookings', 'appointment_records')
          AND column_name = 'organization_id'
        ORDER BY table_name`,
    );
    expect(nullability.rows).toEqual([
      { table_name: 'appointment_records', is_nullable: 'YES' },
      { table_name: 'patient_bookings', is_nullable: 'YES' },
    ]);

    expect(await runMigration()).toBeNull();
    const rerunRows = await run<{ count: string }>(
      `SELECT count(*)::text AS count FROM appointment_records WHERE organization_id = $1`,
      [ORG_A],
    );
    expect(rerunRows.rows[0]?.count).toBe('2');
  });

  it('preserves a zero-match historical row as NULL while stamping its exact sibling', async () => {
    await insertOrganization(ORG_A);
    await insertUser(USER_A);
    await insertAppointment({ id: APPOINTMENT_A, organizationId: ORG_A, userId: USER_A });
    await insertBooking({ id: BOOKING_A, appointmentId: APPOINTMENT_A, userId: USER_A });
    await insertRecord({ integratorRecordId: 's03-no-parent' });

    expect(await runMigration()).toBeNull();
    const preserved = await run<{
      id: string;
      organization_id: string | null;
    }>(
      `SELECT id, organization_id FROM patient_bookings WHERE id = $1
       UNION ALL
       SELECT id, organization_id FROM appointment_records WHERE integrator_record_id = $2
       ORDER BY organization_id NULLS LAST`,
      [BOOKING_A, 's03-no-parent'],
    );
    expect(preserved.rows).toEqual([
      { id: BOOKING_A, organization_id: ORG_A },
      { id: expect.any(String), organization_id: null },
    ]);
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

  it('reuses the patient reader for self-owned NULL-org history and denies foreign or no-principal reads', async () => {
    await insertOrganization(ORG_A);
    await insertUser(USER_A);
    await insertUser(USER_B);
    await insertBooking({ id: BOOKING_A, userId: USER_A });
    await run(
      `INSERT INTO org_enrollments (organization_id, platform_user_id, status)
       VALUES ($1, $2, 'active'), ($1, $3, 'active')`,
      [ORG_A, USER_A, USER_B],
    );
    expect(await runMigration()).toBeNull();

    const client = await pool.connect();
    try {
      const readIds = async (): Promise<string[]> => {
        const rows = await runOnClient<{ id: string }>(
          client,
          `SELECT booking->>'id' AS id
             FROM app.read_current_patient_booking_rows('history', '2030-01-01T00:00:00Z')`,
        );
        return rows.rows.map((row) => row.id);
      };

      expect(await readIds()).toEqual([]);
      await runOnClient(
        client,
        `INSERT INTO app.principal_context (
           backend_pid, org_id, patient_user_id, nonce, expires_epoch
         ) VALUES (
           pg_backend_pid(), $1, $2, 's03-reader-self',
           extract(epoch FROM clock_timestamp())::bigint + 300
         )`,
        [ORG_A, USER_A],
      );
      expect(await readIds()).toEqual([BOOKING_A]);

      await runOnClient(
        client,
        `UPDATE app.principal_context
            SET patient_user_id = $1, nonce = 's03-reader-foreign'
          WHERE backend_pid = pg_backend_pid()`,
        [USER_B],
      );
      expect(await readIds()).toEqual([]);
    } finally {
      await runOnClient(
        client,
        `DELETE FROM app.principal_context WHERE backend_pid = pg_backend_pid()`,
      );
      client.release();
    }
  });

});
