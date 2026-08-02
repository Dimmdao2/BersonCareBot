/**
 * Independent audit acceptance oracles for the two S03 kill-set classes the candidate suite
 * leaves uncovered (#1081):
 *   B2 — the retained rubitime appointment mapping is the only proof for a retired-provider row;
 *        a mapping whose organization contradicts its canonical parent must abort the migration.
 *   D4 — 0309 replaces the sole patient reader wholesale, so its pre-existing canonical self-read
 *        and its organization wall must still hold after the replacement.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PoolClient } from 'pg';
import { getPool } from '@/infra/db/client';
import { createPgAppointmentProjectionPort } from './pgAppointmentProjection';
import { getWebappSqlFromPgClient, runWebappPgText } from '@/infra/db/runWebappSql';

const migrationSql = readFileSync(
  new URL('../../../db/drizzle-migrations/0309_v9b_booking_ownership_local.sql', import.meta.url),
  'utf8',
);

const ORG_A = '30000000-0000-4000-8000-000000000001';
const ORG_B = '30000000-0000-4000-8000-000000000002';
const USER_A = '30000000-0000-4000-8000-000000000003';
const APPOINTMENT_A = '30000000-0000-4000-8000-000000000007';
const APPOINTMENT_B = '30000000-0000-4000-8000-000000000008';
const BOOKING_OWN = '30000000-0000-4000-8000-000000000009';
const BOOKING_FOREIGN = '30000000-0000-4000-8000-00000000000a';
const LEGACY_RECORD_ID = 's03-audit-rubitime-1';

/** The driver wraps the server error; the RAISE text lives on the cause chain. */
function errorMessages(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return `${error.message} ${error.cause === undefined ? '' : errorMessages(error.cause)}`;
}

describe('S03 independent audit — uncovered kill-set classes', () => {
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
       ALTER TABLE be_appointments DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_external_entity_mappings DISABLE ROW LEVEL SECURITY;
       ALTER TABLE org_enrollments DISABLE ROW LEVEL SECURITY;
       ALTER TABLE patient_bookings DISABLE ROW LEVEL SECURITY;
       ALTER TABLE appointment_records DISABLE ROW LEVEL SECURITY;`,
    );
  });

  beforeEach(async () => {
    await run(`DELETE FROM app.principal_context WHERE patient_user_id = $1`, [USER_A]);
    await run(`DELETE FROM appointment_records`);
    await run(`DELETE FROM patient_bookings`);
    await run(`DELETE FROM org_enrollments WHERE platform_user_id = $1`, [USER_A]);
    await run(
      `DELETE FROM be_external_entity_mappings WHERE external_system = 'rubitime' AND external_id = $1`,
      [LEGACY_RECORD_ID],
    );
    await run(`DELETE FROM be_appointments WHERE id IN ($1, $2)`, [APPOINTMENT_A, APPOINTMENT_B]);
    await run(`DELETE FROM platform_users WHERE id = $1`, [USER_A]);
    await run(`DELETE FROM be_organizations WHERE id IN ($1, $2)`, [ORG_A, ORG_B]);
    await run(`DROP FUNCTION IF EXISTS app.read_current_patient_booking_rows(text, timestamptz)`);
    await run(
      `ALTER TABLE patient_bookings DROP COLUMN IF EXISTS organization_id;
       ALTER TABLE appointment_records DROP COLUMN IF EXISTS organization_id;`,
    );
  });

  afterAll(async () => {
    await run(
      `ALTER TABLE be_organizations ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_organizations ENABLE TRIGGER be_organizations_reference_catalog_snapshot;
       ALTER TABLE platform_users ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_appointments ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_external_entity_mappings ENABLE ROW LEVEL SECURITY;
       ALTER TABLE org_enrollments ENABLE ROW LEVEL SECURITY;
       ALTER TABLE patient_bookings ENABLE ROW LEVEL SECURITY;
       ALTER TABLE appointment_records ENABLE ROW LEVEL SECURITY;`,
    );
    await pool.end();
  });

  async function insertOrganization(id: string): Promise<void> {
    await run(`INSERT INTO be_organizations (id, title) VALUES ($1, $2)`, [id, `S03 audit ${id}`]);
  }

  async function insertAppointment(input: {
    id: string;
    organizationId: string;
    userId?: string | null;
  }): Promise<void> {
    await run(
      `INSERT INTO be_appointments (
         id, organization_id, platform_user_id, start_at, end_at,
         duration_minutes, source, status
       ) VALUES ($1, $2, $3, '2027-04-01T10:00:00Z', '2027-04-01T10:30:00Z', 30, 'native', 'confirmed')`,
      [input.id, input.organizationId, input.userId ?? null],
    );
  }

  async function insertBooking(input: {
    id: string;
    appointmentId: string | null;
    userId: string | null;
  }): Promise<void> {
    await run(
      `INSERT INTO patient_bookings (
         id, platform_user_id, booking_type, category, slot_start, slot_end, status,
         contact_phone, contact_name, canonical_appointment_id
       ) VALUES (
         $1, $2, 'online', 'general', '2027-04-01T10:00:00Z', '2027-04-01T10:30:00Z',
         'confirmed', '+70000000003', 'S03 audit', $3
       )`,
      [input.id, input.userId, input.appointmentId],
    );
  }

  async function insertLegacyRecord(): Promise<void> {
    await run(
      `INSERT INTO appointment_records (integrator_record_id, status, payload_json)
       VALUES ($1, 'created', '{"source":"rubitime"}'::jsonb)`,
      [LEGACY_RECORD_ID],
    );
  }

  async function insertAppointmentMapping(organizationId: string): Promise<void> {
    await run(
      `INSERT INTO be_external_entity_mappings (
         organization_id, entity_type, canonical_id, external_system, external_id
       ) VALUES ($1, 'appointment', $2, 'rubitime', $3)`,
      [organizationId, APPOINTMENT_A, LEGACY_RECORD_ID],
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

  it('B2+ stamps a retired-provider row from the retained appointment mapping', async () => {
    await insertOrganization(ORG_A);
    await insertAppointment({ id: APPOINTMENT_A, organizationId: ORG_A });
    await insertLegacyRecord();
    await insertAppointmentMapping(ORG_A);

    expect(await runMigration()).toBeNull();
    const rows = await run<{ organization_id: string | null }>(
      `SELECT organization_id FROM appointment_records WHERE integrator_record_id = $1`,
      [LEGACY_RECORD_ID],
    );
    expect(rows.rows[0]?.organization_id).toBe(ORG_A);
  });

  it('B2 aborts the whole migration when the mapping organization contradicts its canonical parent', async () => {
    await insertOrganization(ORG_A);
    await insertOrganization(ORG_B);
    await insertAppointment({ id: APPOINTMENT_A, organizationId: ORG_A });
    await insertLegacyRecord();
    await insertAppointmentMapping(ORG_B);

    const error = await runMigration();
    expect(error).not.toBeNull();
    expect(errorMessages(error)).toContain('multiple_match=1');
    const columns = await run<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('patient_bookings', 'appointment_records')
          AND column_name = 'organization_id'`,
    );
    expect(columns.rows[0]?.count).toBe('0');
  });

  it('REG-1 keeps a NULL-org legacy record soft-deletable by an admin, as before S03', async () => {
    await insertOrganization(ORG_A);
    await insertLegacyRecord();

    expect(await runMigration()).toBeNull();
    const nullOrg = await run<{ organization_id: string | null }>(
      `SELECT organization_id FROM appointment_records WHERE integrator_record_id = $1`,
      [LEGACY_RECORD_ID],
    );
    // Precondition: this is exactly the retained history S03 promises to preserve.
    expect(nullOrg.rows[0]?.organization_id).toBeNull();

    const projection = createPgAppointmentProjectionPort();
    // Pre-S03 the admin soft-delete route succeeded on a legacy record: no organization_id column
    // existed, so the caller's workspace org could not refuse it.
    await expect(
      projection.softDeleteByIntegratorId(LEGACY_RECORD_ID, { organizationId: ORG_A }),
    ).resolves.toBe(true);
    const after = await run<{ deleted_at: Date | null }>(
      `SELECT deleted_at FROM appointment_records WHERE integrator_record_id = $1`,
      [LEGACY_RECORD_ID],
    );
    expect(after.rows[0]?.deleted_at).not.toBeNull();
  });

  it('D4 keeps the canonical self-read and its organization wall after the reader is replaced', async () => {
    await insertOrganization(ORG_A);
    await insertOrganization(ORG_B);
    await run(`INSERT INTO platform_users (id) VALUES ($1)`, [USER_A]);
    await insertAppointment({ id: APPOINTMENT_A, organizationId: ORG_A, userId: USER_A });
    await insertAppointment({ id: APPOINTMENT_B, organizationId: ORG_B, userId: USER_A });
    await insertBooking({ id: BOOKING_OWN, appointmentId: APPOINTMENT_A, userId: USER_A });
    await insertBooking({ id: BOOKING_FOREIGN, appointmentId: APPOINTMENT_B, userId: USER_A });
    await run(
      `INSERT INTO org_enrollments (organization_id, platform_user_id, status)
       VALUES ($1, $2, 'active')`,
      [ORG_A, USER_A],
    );

    expect(await runMigration()).toBeNull();

    const client = await pool.connect();
    try {
      await runOnClient(
        client,
        `INSERT INTO app.principal_context (
           backend_pid, org_id, patient_user_id, nonce, expires_epoch
         ) VALUES (
           pg_backend_pid(), $1, $2, 's03-audit-canonical',
           extract(epoch FROM clock_timestamp())::bigint + 300
         )`,
        [ORG_A, USER_A],
      );
      const rows = await runOnClient<{ id: string }>(
        client,
        `SELECT booking->>'id' AS id
           FROM app.read_current_patient_booking_rows('history', '2030-01-01T00:00:00Z')`,
      );
      expect(rows.rows.map((row) => row.id)).toEqual([BOOKING_OWN]);
    } finally {
      await runOnClient(
        client,
        `DELETE FROM app.principal_context WHERE backend_pid = pg_backend_pid()`,
      );
      client.release();
    }
  });
});
