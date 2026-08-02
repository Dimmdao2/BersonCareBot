/**
 * S03 writer oracle (#1081): a canonical organization must survive the real PostgreSQL writer,
 * and an existing appointment projection must never move to another organization on conflict.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import { runWebappPgText } from '@/infra/db/runWebappSql';
import { pgPatientBookingsPort } from './pgPatientBookings';
import { createPgAppointmentProjectionPort } from './pgAppointmentProjection';

const ORG_A = '10000000-0000-4000-8000-000000000001';
const ORG_B = '10000000-0000-4000-8000-000000000002';
const USER_ID = '10000000-0000-4000-8000-000000000003';
const APPOINTMENT_ID = '10000000-0000-4000-8000-000000000004';
const TOMBSTONE_APPOINTMENT_ID = '10000000-0000-4000-8000-000000000005';

describe('S03 booking ownership writers', () => {
  async function run<T = unknown>(queryText: string, values: readonly unknown[] = []) {
    return runWebappPgText<T>(queryText, values);
  }

  beforeAll(async () => {
    await run(
      `ALTER TABLE be_organizations DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_organizations DISABLE TRIGGER be_organizations_reference_catalog_snapshot;
       ALTER TABLE platform_users DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_appointments DISABLE ROW LEVEL SECURITY;
       ALTER TABLE patient_bookings DISABLE ROW LEVEL SECURITY;
       ALTER TABLE appointment_records DISABLE ROW LEVEL SECURITY;`,
    );
    await run(
      `INSERT INTO be_organizations (id, title)
       VALUES ($1, 'S03 A'), ($2, 'S03 B')`,
      [ORG_A, ORG_B],
    );
    await run(`INSERT INTO platform_users (id) VALUES ($1)`, [USER_ID]);
    await run(
      `INSERT INTO be_appointments (
         id, organization_id, platform_user_id, start_at, end_at, duration_minutes, source, status
       ) VALUES
         ($1, $3, $4, '2027-02-01T10:00:00Z', '2027-02-01T10:30:00Z', 30, 'native', 'confirmed'),
         ($2, $3, $4, '2027-02-02T10:00:00Z', '2027-02-02T10:30:00Z', 30, 'native', 'cancelled_by_specialist')`,
      [APPOINTMENT_ID, TOMBSTONE_APPOINTMENT_ID, ORG_A, USER_ID],
    );
  });

  afterAll(async () => {
    await run(
      `ALTER TABLE be_organizations ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_organizations ENABLE TRIGGER be_organizations_reference_catalog_snapshot;
       ALTER TABLE platform_users ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_appointments ENABLE ROW LEVEL SECURITY;
       ALTER TABLE patient_bookings ENABLE ROW LEVEL SECURITY;
       ALTER TABLE appointment_records ENABLE ROW LEVEL SECURITY;`,
    );
    await getPool().end();
  });

  it('persists the canonical organization through pending booking and native projection writes', async () => {
    const booking = await pgPatientBookingsPort.createPending({
      organizationId: ORG_A,
      userId: USER_ID,
      bookingType: 'online',
      city: null,
      category: 'general',
      slotStart: '2027-02-01T11:00:00Z',
      slotEnd: '2027-02-01T11:30:00Z',
      contactName: 'S03 fixture',
      contactPhone: '+70000000001',
      contactEmail: null,
      branchId: null,
      serviceId: null,
      branchServiceId: null,
      cityCodeSnapshot: null,
      branchTitleSnapshot: null,
      serviceTitleSnapshot: null,
      durationMinutesSnapshot: 30,
      priceMinorSnapshot: null,
    });
    expect(booking.organizationId).toBe(ORG_A);

    const projection = createPgAppointmentProjectionPort();
    await projection.upsertRecordFromProjection({
      organizationId: ORG_A,
      platformUserId: USER_ID,
      integratorRecordId: `be:${APPOINTMENT_ID}`,
      phoneNormalized: '+70000000001',
      recordAt: '2027-02-01T10:00:00Z',
      status: 'created',
      payloadJson: {
        source: 'native',
        appointment_id: APPOINTMENT_ID,
        platform_user_id: USER_ID,
      },
      lastEvent: 'native.created',
      updatedAt: '2027-02-01T09:00:00Z',
      branchId: null,
    });

    const persisted = await run<{
      booking_org: string;
      record_org: string;
    }>(
      `SELECT pb.organization_id AS booking_org, ar.organization_id AS record_org
         FROM patient_bookings pb
         JOIN appointment_records ar ON ar.integrator_record_id = $2
        WHERE pb.id = $1`,
      [booking.id, `be:${APPOINTMENT_ID}`],
    );
    expect(persisted.rows[0]).toEqual({ booking_org: ORG_A, record_org: ORG_A });
  });

  it('rejects a conflicting upsert and leaves the existing organization unchanged', async () => {
    const projection = createPgAppointmentProjectionPort();
    const integratorRecordId = `be:${APPOINTMENT_ID}:conflict`;
    const input = {
      platformUserId: USER_ID,
      integratorRecordId,
      phoneNormalized: '+70000000001',
      recordAt: '2027-02-01T10:00:00Z',
      status: 'created',
      payloadJson: { source: 'native', appointment_id: APPOINTMENT_ID },
      lastEvent: 'native.created',
      updatedAt: '2027-02-01T09:00:00Z',
      branchId: null,
    };

    await projection.upsertRecordFromProjection({ ...input, organizationId: ORG_A });
    await expect(
      projection.upsertRecordFromProjection({ ...input, organizationId: ORG_B }),
    ).rejects.toThrow('appointment_projection_organization_mismatch');

    const persisted = await run<{ organization_id: string }>(
      `SELECT organization_id FROM appointment_records WHERE integrator_record_id = $1`,
      [integratorRecordId],
    );
    expect(persisted.rows[0]?.organization_id).toBe(ORG_A);
  });

  it('writes the resolved canonical organization into a staff-delete tombstone', async () => {
    const projection = createPgAppointmentProjectionPort();
    await expect(
      projection.softDeleteByCanonicalAppointmentId(TOMBSTONE_APPOINTMENT_ID, ORG_A),
    ).resolves.toBe(true);

    const persisted = await run<{
      organization_id: string;
      last_event: string;
      deleted_at: Date | null;
    }>(
      `SELECT organization_id, last_event, deleted_at
         FROM appointment_records
        WHERE integrator_record_id = $1`,
      [`be:${TOMBSTONE_APPOINTMENT_ID}`],
    );
    expect(persisted.rows[0]?.organization_id).toBe(ORG_A);
    expect(persisted.rows[0]?.last_event).toBe('staff_delete');
    expect(persisted.rows[0]?.deleted_at).not.toBeNull();
  });
});
